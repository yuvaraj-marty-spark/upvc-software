import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_shop
from app.db.dependencies import get_db
from app.models.customer import Customer
from app.models.project import Project
from app.models.shop import Shop
from app.models.shop_setting import ShopFormulaSetting


router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
)


class FormulaSettingsPayload(BaseModel):
    customer_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    formulas: dict[str, dict[str, Any]] = Field(default_factory=dict)


def _load_settings_dict(record: ShopFormulaSetting | None) -> dict[str, Any]:
    if record is None or not record.formulas_json:
        return {}
    try:
        parsed = json.loads(record.formulas_json)
        return parsed if isinstance(parsed, dict) else {}
    except ValueError:
        return {}


def _resolve_scope_ids(
    db: Session,
    shop: Shop,
    customer_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Validate and resolve shop-scoped project_id and customer_id."""
    valid_project_id: uuid.UUID | None = None
    resolved_customer_id: uuid.UUID | None = None

    if project_id is not None:
        project = db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.shop_id == shop.id,
            )
        )
        if project is not None:
            valid_project_id = project.id
            resolved_customer_id = project.customer_id

    if resolved_customer_id is None and customer_id is not None:
        customer = db.scalar(
            select(Customer.id).where(
                Customer.id == customer_id,
                Customer.shop_id == shop.id,
            )
        )
        if customer is not None:
            resolved_customer_id = customer

    return valid_project_id, resolved_customer_id


@router.get("/formulas")
def get_formula_settings(
    customer_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    if customer_id is None and project_id is None:
        # New/unassigned customers always start at workshop default formulas
        return {"formulas": {}}

    valid_project_id, resolved_customer_id = _resolve_scope_ids(
        db, shop, customer_id, project_id
    )
    if valid_project_id is None and resolved_customer_id is None:
        return {"formulas": {}}

    record = db.scalar(
        select(ShopFormulaSetting).where(ShopFormulaSetting.shop_id == shop.id)
    )
    data = _load_settings_dict(record)
    projects_map = data.get("__projects__", {})
    customers_map = data.get("__customers__", {})

    if valid_project_id is not None and isinstance(projects_map, dict):
        proj_formulas = projects_map.get(str(valid_project_id))
        if isinstance(proj_formulas, dict):
            return {"formulas": proj_formulas}

    if resolved_customer_id is not None and isinstance(customers_map, dict):
        cust_formulas = customers_map.get(str(resolved_customer_id))
        if isinstance(cust_formulas, dict):
            return {"formulas": cust_formulas}

    return {"formulas": {}}


@router.put("/formulas")
def save_formula_settings(
    payload: FormulaSettingsPayload,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    if payload.customer_id is None and payload.project_id is None:
        return {"formulas": payload.formulas}

    valid_project_id, resolved_customer_id = _resolve_scope_ids(
        db, shop, payload.customer_id, payload.project_id
    )
    if valid_project_id is None and resolved_customer_id is None:
        return {"formulas": payload.formulas}

    record = db.scalar(
        select(ShopFormulaSetting).where(ShopFormulaSetting.shop_id == shop.id)
    )
    data = _load_settings_dict(record)

    projects_map = data.get("__projects__")
    if not isinstance(projects_map, dict):
        projects_map = {}

    customers_map = data.get("__customers__")
    if not isinstance(customers_map, dict):
        customers_map = {}

    if valid_project_id is not None:
        proj_key = str(valid_project_id)
        if payload.formulas:
            projects_map[proj_key] = payload.formulas
        else:
            projects_map.pop(proj_key, None)

    if resolved_customer_id is not None:
        cust_key = str(resolved_customer_id)
        if payload.formulas:
            customers_map[cust_key] = payload.formulas
        else:
            customers_map.pop(cust_key, None)

    data["__projects__"] = projects_map
    data["__customers__"] = customers_map
    serialized = json.dumps(data)

    if record is None:
        record = ShopFormulaSetting(
            shop_id=shop.id,
            formulas_json=serialized,
        )
        db.add(record)
    else:
        record.formulas_json = serialized

    db.commit()
    return {"formulas": payload.formulas}
