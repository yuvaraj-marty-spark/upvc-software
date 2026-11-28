
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_shop
from app.api.routes.measurements import convert_to_mm
from app.db.dependencies import get_db
from app.models.customer import Customer
from app.models.measurement import Measurement
from app.models.project import Project
from app.models.shop import Shop
from app.schemas.measurement import (
    MeasurementBatchItem,
    MeasurementResponse,
)
from app.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectStatusUpdate,
)


router = APIRouter(
    prefix="/projects",
    tags=["Projects"],
)


# --------------- Atomic Save-Order schema ---------------

class SaveOrderProject(BaseModel):
    customer_id: uuid.UUID
    name: str = Field(min_length=2, max_length=200)
    serial_number: str | None = None
    description: str | None = None
    status: str | None = Field(default="pending", max_length=30)
    input_unit: str = Field(default="in", pattern="^(in|cm|mm)$")
    output_unit: str = Field(default="mm", pattern="^(in|cm|mm)$")
    default_tolerance_mm: Decimal = Field(default=Decimal("5"), ge=0, le=100)
    default_apply_tolerance: bool = True


class SaveOrderRequest(BaseModel):
    project_id: uuid.UUID | None = None
    project: SaveOrderProject
    measurements: list[MeasurementBatchItem]
    delete_ids: list[uuid.UUID] = Field(default_factory=list)


class SaveOrderResponse(BaseModel):
    project: ProjectResponse
    measurements: list[MeasurementResponse]


def generate_unique_project_serial_number(db: Session, shop: Shop) -> str:
    """Generate sequential unique project serial numbers per shop
    (e.g. PROJ-1, PROJ-2).
    """
    import re

    serials = db.scalars(
        select(Project.serial_number).where(Project.shop_id == shop.id)
    ).all()
    existing_nums = set()

    for serial in serials:
        if serial:
            match = re.search(r"(\d+)", serial)
            if match:
                try:
                    num = int(match.group(1))
                    existing_nums.add(num)
                except ValueError:
                    pass

    next_num = max(existing_nums, default=0) + 1

    return f"PROJ-{next_num}"


@router.post(
    "/",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    customer_statement = select(Customer).where(
        Customer.id == project_data.customer_id,
        Customer.shop_id == shop.id,
        Customer.is_active.is_(True),
    )

    customer = db.scalar(customer_statement)

    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active customer not found.",
        )

    cleaned_name = project_data.name.strip()
    status_val = project_data.status or "active"

    # Enforce unique project/order name per customer.
    existing_project = db.scalar(
        select(Project).where(
            Project.shop_id == shop.id,
            Project.customer_id == customer.id,
            Project.name.ilike(cleaned_name),
            Project.status != "inactive",
        )
    )

    if existing_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="enter unique name",
        )

    # Assign a unique project serial number.
    custom_serial = (
        project_data.serial_number.strip().upper()
        if project_data.serial_number and project_data.serial_number.strip()
        else None
    )

    if custom_serial:
        duplicate_serial = db.scalar(
            select(Project).where(
                Project.shop_id == shop.id,
                Project.serial_number == custom_serial,
            )
        )
        if duplicate_serial:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Serial number {custom_serial} "
                    "already exists in your shop."
                ),
            )

    max_attempts = 1 if custom_serial else 5
    for attempt in range(max_attempts):
        serial_val = custom_serial or generate_unique_project_serial_number(db, shop)
        project = Project(
            shop_id=shop.id,
            customer_id=customer.id,
            serial_number=serial_val,
            name=cleaned_name,
            description=project_data.description,
            status=status_val,
            input_unit=project_data.input_unit,
            output_unit=project_data.output_unit,
            default_tolerance_mm=project_data.default_tolerance_mm,
            default_apply_tolerance=project_data.default_apply_tolerance,
        )
        db.add(project)
        try:
            db.commit()
            return project
        except IntegrityError as exc:
            db.rollback()
            if custom_serial or attempt == max_attempts - 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Project serial number conflicted with an existing record.",
                ) from exc


# --------------- ATOMIC SAVE ORDER ---------------
# One request = create-or-update project + batch-sync measurements
# in a single DB transaction.  Replaces the 2–3 sequential calls
# the frontend used to make.

@router.post(
    "/save-order",
    response_model=SaveOrderResponse,
    status_code=status.HTTP_200_OK,
)
def save_order(
    body: SaveOrderRequest,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    cleaned_name = body.project.name.strip()
    project_id = body.project_id

    # --- 1. Load or create project (skip redundant Customer/name checks on unchanged updates) ---
    if project_id:
        project = db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.shop_id == shop.id,
                Project.status != "inactive",
            )
        )
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found.",
            )

        customer_changed = project.customer_id != body.project.customer_id
        if customer_changed:
            customer = db.scalar(
                select(Customer).where(
                    Customer.id == body.project.customer_id,
                    Customer.shop_id == shop.id,
                    Customer.is_active.is_(True),
                )
            )
            if customer is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Active customer not found.",
                )

        if customer_changed or project.name.lower() != cleaned_name.lower():
            dup = db.scalar(
                select(Project).where(
                    Project.shop_id == shop.id,
                    Project.customer_id == body.project.customer_id,
                    Project.name.ilike(cleaned_name),
                    Project.id != project_id,
                    Project.status != "inactive",
                )
            )
            if dup:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="enter unique name",
                )

        project.customer_id = body.project.customer_id
        project.name = cleaned_name
        project.description = body.project.description
        project.input_unit = body.project.input_unit
        project.output_unit = body.project.output_unit
        project.default_tolerance_mm = body.project.default_tolerance_mm
        project.default_apply_tolerance = body.project.default_apply_tolerance
        if body.project.status:
            project.status = body.project.status
    else:
        customer = db.scalar(
            select(Customer).where(
                Customer.id == body.project.customer_id,
                Customer.shop_id == shop.id,
                Customer.is_active.is_(True),
            )
        )
        if customer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active customer not found.",
            )

        # Enforce 1 active project serial per customer: if this customer already
        # has an active project, update it instead of creating a duplicate PROJ-N.
        existing_customer_project = db.scalar(
            select(Project)
            .where(
                Project.shop_id == shop.id,
                Project.customer_id == customer.id,
                Project.status != "inactive",
            )
            .order_by(Project.created_at.desc())
            .limit(1)
        )

        if existing_customer_project is not None:
            project = existing_customer_project
            project.name = cleaned_name
            project.description = body.project.description
            project.input_unit = body.project.input_unit
            project.output_unit = body.project.output_unit
            project.default_tolerance_mm = body.project.default_tolerance_mm
            project.default_apply_tolerance = body.project.default_apply_tolerance
            if body.project.status:
                project.status = body.project.status
        else:
            # Custom or auto serial
            custom_serial = (
                body.project.serial_number.strip().upper()
                if body.project.serial_number and body.project.serial_number.strip()
                else None
            )
            if custom_serial:
                if db.scalar(
                    select(Project).where(
                        Project.shop_id == shop.id,
                        Project.serial_number == custom_serial,
                    )
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Serial number {custom_serial} already exists in your shop.",
                    )

            serial_val = custom_serial or generate_unique_project_serial_number(db, shop)
            project = Project(
                shop_id=shop.id,
                customer_id=customer.id,
                serial_number=serial_val,
                name=cleaned_name,
                description=body.project.description,
                status=body.project.status or "active",
                input_unit=body.project.input_unit,
                output_unit=body.project.output_unit,
                default_tolerance_mm=body.project.default_tolerance_mm,
                default_apply_tolerance=body.project.default_apply_tolerance,
            )
            db.add(project)
            db.flush()  # assign project.id without committing

    # --- 3. Batch-sync measurements (same transaction) ---
    existing_measurements = list(
        db.scalars(
            select(Measurement).where(
                Measurement.project_id == project.id,
                Measurement.shop_id == shop.id,
            )
        ).all()
    )
    existing_by_id = {m.id: m for m in existing_measurements}

    m_ids = [item.id for item in body.measurements if item.id is not None]
    if len(m_ids) != len(set(m_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Measurement IDs must be unique within a batch.",
        )
    row_orders = [item.row_order for item in body.measurements]
    if len(row_orders) != len(set(row_orders)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Measurement row orders must be unique within a batch.",
        )

    delete_ids = set(body.delete_ids)
    if delete_ids.intersection(m_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A measurement cannot be updated and deleted in the same batch.",
        )

    synced: list[Measurement] = []
    for item in body.measurements:
        input_unit = item.input_unit or project.input_unit
        measurement = existing_by_id.get(item.id) if item.id else None

        if measurement is None:
            measurement = Measurement(
                id=item.id or uuid.uuid4(),
                shop_id=shop.id,
                project_id=project.id,
                tolerance_mm=(
                    item.tolerance_mm if item.tolerance_mm is not None
                    else project.default_tolerance_mm
                ),
                apply_tolerance=(
                    item.apply_tolerance if item.apply_tolerance is not None
                    else project.default_apply_tolerance
                ),
            )
            db.add(measurement)
        else:
            if item.tolerance_mm is not None:
                measurement.tolerance_mm = item.tolerance_mm
            if item.apply_tolerance is not None:
                measurement.apply_tolerance = item.apply_tolerance

        measurement.row_order = item.row_order
        measurement.height = item.height
        measurement.width = item.width
        measurement.input_unit = input_unit
        measurement.height_mm = convert_to_mm(item.height, input_unit)
        measurement.width_mm = convert_to_mm(item.width, input_unit)
        measurement.model_id = item.model_id
        measurement.variant_letter = item.variant_letter or ""
        measurement.glass_type = item.glass_type
        measurement.height_additional_mm = item.height_additional_mm
        measurement.width_additional_mm = item.width_additional_mm
        measurement.identification_color = item.identification_color
        measurement.status = item.status or "pending"
        synced.append(measurement)

    for mid in delete_ids:
        m = existing_by_id.get(mid)
        if m is not None:
            db.delete(m)

    # --- 4. Compute completion from in-memory rows (no extra SELECT) ---
    all_rows = [m for m in synced]
    # Also include existing measurements that weren't touched or deleted
    touched_ids = {m.id for m in synced}
    for m in existing_measurements:
        if m.id not in touched_ids and m.id not in delete_ids:
            all_rows.append(m)

    all_finished = bool(all_rows) and all(
        m.status.lower() in ("finished", "completed") for m in all_rows
    )
    if all_finished:
        project.status = "completed"
    elif project.status == "completed":
        project.status = "active"

    # --- 5. Single commit for everything ---
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Save conflicted with existing data.",
        ) from exc

    return SaveOrderResponse(
        project=ProjectResponse.model_validate(project),
        measurements=sorted(
            [MeasurementResponse.model_validate(m) for m in synced],
            key=lambda m: m.row_order,
        ),
    )


@router.get("/", response_model=list[ProjectResponse])
def get_projects(
    customer_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    query = select(Project).where(Project.shop_id == shop.id)

    if status_filter and status_filter.lower() != "all":
        query = query.where(
            Project.status == status_filter.lower()
        )
    else:
        query = query.where(Project.status != "inactive")

    if customer_id is not None:
        query = query.where(
            Project.customer_id == customer_id
        )

    statement = query.order_by(Project.created_at.desc())
    return list(db.scalars(statement).all())


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Project).where(
        Project.id == project_id,
        Project.shop_id == shop.id,
        Project.status != "inactive",
    )

    project = db.scalar(statement)

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    return project


@router.put(
    "/{project_id}",
    response_model=ProjectResponse,
)
def update_project(
    project_id: uuid.UUID,
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Project).where(
        Project.id == project_id,
        Project.shop_id == shop.id,
        Project.status != "inactive",
    )

    project = db.scalar(statement)

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    customer_statement = select(Customer).where(
        Customer.id == project_data.customer_id,
        Customer.shop_id == shop.id,
        Customer.is_active.is_(True),
    )

    customer = db.scalar(customer_statement)

    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active customer not found.",
        )

    cleaned_name = project_data.name.strip()

    # Reject duplicate project names for this customer.
    existing_project = db.scalar(
        select(Project).where(
            Project.shop_id == shop.id,
            Project.customer_id == customer.id,
            Project.name.ilike(cleaned_name),
            Project.id != project_id,
            Project.status != "inactive",
        )
    )

    if existing_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="enter unique name",
        )

    project.customer_id = customer.id
    project.name = cleaned_name
    project.description = project_data.description
    project.input_unit = project_data.input_unit
    project.output_unit = project_data.output_unit
    project.default_tolerance_mm = project_data.default_tolerance_mm
    project.default_apply_tolerance = (
        project_data.default_apply_tolerance
    )

    if project_data.status:
        project.status = project_data.status

    db.commit()

    return project



@router.patch(
    "/{project_id}/status",
    response_model=ProjectResponse,
)
def update_project_status(
    project_id: uuid.UUID,
    payload: ProjectStatusUpdate,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Project).where(
        Project.id == project_id,
        Project.shop_id == shop.id,
    )

    project = db.scalar(statement)

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    project.status = payload.status
    db.commit()

    return project



@router.delete("/{project_id}")
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Project).where(
        Project.id == project_id,
        Project.shop_id == shop.id,
        Project.status != "inactive",
    )

    project = db.scalar(statement)

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    project.status = "inactive"

    db.commit()

    return {
        "message": "Project deactivated successfully."
    }
