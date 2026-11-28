import collections
from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_shop
from app.db.dependencies import get_db
from app.models.customer import Customer
from app.models.measurement import Measurement
from app.models.project import Project
from app.models.shop import Shop


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
) -> dict[str, Any]:
    # 1. Fetch active projects with active customer details
    projects_stmt = (
        select(Project, Customer)
        .join(Customer, Customer.id == Project.customer_id)
        .where(
            Project.shop_id == shop.id,
            Project.status != "inactive",
            Customer.is_active.is_(True),
        )
        .order_by(Project.created_at.desc())
    )
    project_customer_pairs = db.execute(projects_stmt).all()

    # 2. Fetch measurements only for active projects in this shop
    active_project_ids = [proj.id for proj, _ in project_customer_pairs]
    all_measurements: list[Measurement] = []
    if active_project_ids:
        measurements_stmt = (
            select(Measurement)
            .where(
                Measurement.shop_id == shop.id,
                Measurement.project_id.in_(active_project_ids),
            )
            .order_by(Measurement.row_order.asc())
        )
        all_measurements = list(db.scalars(measurements_stmt).all())

    measurements_by_proj: dict[uuid.UUID, list[Measurement]] = collections.defaultdict(list)
    for m in all_measurements:
        measurements_by_proj[m.project_id].append(m)

    # 3. Counters & Aggregations
    now = datetime.now(timezone.utc)
    current_year_month = now.strftime("%Y-%m")
    current_year_week = f"{now.isocalendar()[0]}-W{now.isocalendar()[1]:02d}"

    # Previous month string
    first_of_month = now.replace(day=1)
    prev_month_date = first_of_month - timedelta(days=1)
    prev_year_month = prev_month_date.strftime("%Y-%m")

    # Previous week string
    prev_week_date = now - timedelta(days=7)
    prev_year_week = f"{prev_week_date.isocalendar()[0]}-W{prev_week_date.isocalendar()[1]:02d}"

    status_counts = {"total": 0, "pending": 0, "active": 0, "completed": 0}
    orders_by_month: dict[str, int] = collections.defaultdict(int)
    orders_by_week: dict[str, int] = collections.defaultdict(int)
    pending_by_month: dict[str, int] = collections.defaultdict(int)

    projects_summary = []

    for proj, cust in project_customer_pairs:
        status_counts["total"] += 1

        proj_windows = measurements_by_proj.get(proj.id, [])
        total_w = len(proj_windows)
        finished_w = sum(1 for m in proj_windows if m.status.lower() in ("finished", "completed", "done"))
        pending_w = total_w - finished_w
        not_finished_w = pending_w

        st = (proj.status or "active").lower()
        if st in status_counts:
            status_counts[st] += 1
        elif st in ("in_progress", "active"):
            status_counts["active"] += 1
        elif st in ("finished", "completed"):
            status_counts["completed"] += 1
        else:
            status_counts["active"] += 1

        pct = round((finished_w / total_w * 100), 1) if total_w > 0 else (100.0 if st in ("completed", "finished") else 0.0)

        dt = proj.created_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        m_key = dt.strftime("%Y-%m")
        w_key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"

        orders_by_month[m_key] += 1
        orders_by_week[w_key] += 1

        if st in ("pending", "active"):
            pending_by_month[m_key] += 1

        windows_detail = [
            {
                "id": str(m.id),
                "row_order": m.row_order,
                "model_id": m.model_id,
                "variant_letter": m.variant_letter or "",
                "height": float(m.height) if m.height is not None else None,
                "width": float(m.width) if m.width is not None else None,
                "input_unit": m.input_unit,
                "glass_type": m.glass_type,
                "status": m.status or "pending",
                "identification_color": m.identification_color,
            }
            for m in proj_windows
        ]

        projects_summary.append({
            "project_id": str(proj.id),
            "project_name": proj.name,
            "serial_number": proj.serial_number,
            "customer_id": str(cust.id),
            "customer_name": cust.name,
            "customer_phone": cust.phone,
            "status": proj.status,
            "created_at": dt.isoformat(),
            "total_windows": total_w,
            "finished_windows": finished_w,
            "not_finished_windows": not_finished_w,
            "pending_windows": pending_w,
            "completion_pct": pct,
            "windows": windows_detail,
        })

    # Prepare past 6 months history
    months_history = []
    month_cursor = now.replace(day=1)
    for _ in range(6):
        key = month_cursor.strftime("%Y-%m")
        label = month_cursor.strftime("%b %Y")
        months_history.append({
            "month": key,
            "label": label,
            "count": orders_by_month.get(key, 0),
            "pending_count": pending_by_month.get(key, 0),
        })
        # step back to previous month
        month_cursor = (month_cursor - timedelta(days=1)).replace(day=1)
    months_history.reverse()

    # Prepare past 6 weeks history
    weeks_history = []
    # Start from current week Monday
    current_monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    for i in range(5, -1, -1):
        w_start = current_monday - timedelta(weeks=i)
        w_end = w_start + timedelta(days=6)
        w_key = f"{w_start.isocalendar()[0]}-W{w_start.isocalendar()[1]:02d}"
        label = f"{w_start.strftime('%b %d')} - {w_end.strftime('%b %d')}"
        weeks_history.append({
            "week": w_key,
            "label": label,
            "count": orders_by_week.get(w_key, 0),
        })

    this_month_count = orders_by_month.get(current_year_month, 0)
    last_month_count = orders_by_month.get(prev_year_month, 0)
    this_week_count = orders_by_week.get(current_year_week, 0)
    last_week_count = orders_by_week.get(prev_year_week, 0)
    current_month_pending = pending_by_month.get(current_year_month, 0)

    return {
        "project_status": status_counts,
        "monthly_pending": {
            "current_month_pending": current_month_pending,
            "total_pending": status_counts["pending"] + status_counts["active"],
            "history": [
                {"month": m["month"], "label": m["label"], "pending_count": m["pending_count"]}
                for m in months_history
            ],
        },
        "orders_per_month": {
            "this_month_count": this_month_count,
            "last_month_count": last_month_count,
            "history": months_history,
        },
        "orders_per_week": {
            "this_week_count": this_week_count,
            "last_week_count": last_week_count,
            "history": weeks_history,
        },
        "projects_window_summary": projects_summary,
    }
