
import json
import uuid
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_shop
from app.db.dependencies import get_db
from app.models.customer import Customer
from app.models.measurement import Measurement
from app.models.project import Project
from app.models.shop import Shop
from app.models.shop_setting import ShopFormulaSetting
from app.schemas.customer import CustomerCreate, CustomerResponse


router = APIRouter(
    prefix="/customers",
    tags=["Customers"],
)


def generate_customer_serial(db: Session, shop: Shop) -> str:
    while True:
        serial_number = f"CUST-{uuid4().hex[:8].upper()}"
        existing = db.scalar(
            select(Customer).where(
                Customer.shop_id == shop.id,
                Customer.serial_number == serial_number,
            )
        )
        if existing is None:
            return serial_number


def validate_unique_serial(
    db: Session,
    shop: Shop,
    serial_number: str,
    current_customer_id: uuid.UUID | None = None,
) -> None:
    statement = select(Customer).where(
        Customer.shop_id == shop.id,
        Customer.serial_number == serial_number,
    )
    if current_customer_id is not None:
        statement = statement.where(Customer.id != current_customer_id)

    duplicate = db.scalar(statement)
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Customer serial number already exists in this shop.",
        )


@router.post(
    "/",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_customer(
    customer_data: CustomerCreate,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    cleaned_name = customer_data.name.strip()
    cleaned_phone = (
        customer_data.phone.strip() if customer_data.phone else None
    )
    cleaned_email = (
        customer_data.email.lower().strip()
        if customer_data.email
        else None
    )
    cleaned_serial = (
        customer_data.serial_number.strip()
        if customer_data.serial_number
        else None
    )

    if cleaned_serial:
        validate_unique_serial(db, shop, cleaned_serial)
    else:
        cleaned_serial = generate_customer_serial(db, shop)

    customer = Customer(
        shop_id=shop.id,
        name=cleaned_name,
        phone=cleaned_phone,
        serial_number=cleaned_serial,
        email=cleaned_email,
        address=customer_data.address,
    )

    db.add(customer)
    db.commit()

    return customer


@router.get("/", response_model=list[CustomerResponse])
def get_customers(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Customer).where(
        Customer.shop_id == shop.id
    )

    if not include_inactive:
        statement = statement.where(
            Customer.is_active.is_(True)
        )

    statement = statement.order_by(
        Customer.created_at.desc()
    )

    return db.scalars(statement).all()


@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
)
def get_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Customer).where(
        Customer.id == customer_id,
        Customer.shop_id == shop.id,
        Customer.is_active.is_(True),
    )

    customer = db.scalar(statement)

    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    return customer


@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
)
def update_customer(
    customer_id: uuid.UUID,
    customer_data: CustomerCreate,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Customer).where(
        Customer.id == customer_id,
        Customer.shop_id == shop.id,
        Customer.is_active.is_(True),
    )

    customer = db.scalar(statement)

    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    cleaned_phone = (
        customer_data.phone.strip()
        if customer_data.phone
        else None
    )
    cleaned_serial = (
        customer_data.serial_number.strip()
        if customer_data.serial_number
        else customer.serial_number
    )

    if cleaned_serial:
        validate_unique_serial(
            db,
            shop,
            cleaned_serial,
            current_customer_id=customer.id,
        )

    customer.name = customer_data.name.strip()
    customer.phone = cleaned_phone
    customer.serial_number = cleaned_serial
    customer.email = (
        customer_data.email.lower()
        if customer_data.email
        else None
    )
    customer.address = customer_data.address

    db.commit()

    return customer


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Customer).where(
        Customer.id == customer_id,
        Customer.shop_id == shop.id,
        Customer.is_active.is_(True),
    )

    customer = db.scalar(statement)

    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    # Soft delete: retain projects and measurements for restoration.
    customer.is_active = False
    db.commit()

    return {
        "message": "Customer moved to Deleted Customers successfully."
    }


@router.patch("/{customer_id}/restore")
def restore_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Customer).where(
        Customer.id == customer_id,
        Customer.shop_id == shop.id,
        Customer.is_active.is_(False),
    )

    customer = db.scalar(statement)

    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deleted customer not found.",
        )

    customer.is_active = True
    db.commit()

    return {
        "message": "Customer restored successfully."
    }


@router.delete("/{customer_id}/permanent")
def permanently_delete_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    shop: Shop = Depends(get_current_shop),
):
    statement = select(Customer).where(
        Customer.id == customer_id,
        Customer.shop_id == shop.id,
    )

    customer = db.scalar(statement)

    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found.",
        )

    # Select this customer's projects within the current shop.
    project_ids = select(Project.id).where(
        Project.customer_id == customer.id,
        Project.shop_id == shop.id,
    )
    deleted_proj_keys = {str(pid) for pid in db.scalars(project_ids).all()}

    try:
        # Delete measurements before deleting their parent projects.
        db.execute(
            delete(Measurement).where(
                Measurement.project_id.in_(project_ids),
                Measurement.shop_id == shop.id,
            )
        )

        # Delete all projects belonging to this customer.
        db.execute(
            delete(Project).where(
                Project.customer_id == customer.id,
                Project.shop_id == shop.id,
            )
        )

        # Remove any saved formula settings belonging to this customer or its deleted projects.
        deleted_cust_key = str(customer.id)
        setting = db.scalar(
            select(ShopFormulaSetting).where(ShopFormulaSetting.shop_id == shop.id)
        )
        if setting and setting.formulas_json:
            try:
                data = json.loads(setting.formulas_json)
                if isinstance(data, dict):
                    changed = False
                    projects_map = data.get("__projects__")
                    if isinstance(projects_map, dict) and deleted_proj_keys:
                        for key in deleted_proj_keys:
                            if key in projects_map:
                                projects_map.pop(key, None)
                                changed = True
                    customers_map = data.get("__customers__")
                    if isinstance(customers_map, dict) and deleted_cust_key in customers_map:
                        customers_map.pop(deleted_cust_key, None)
                        changed = True
                    if changed:
                        setting.formulas_json = json.dumps(data)
            except ValueError:
                pass

        # Delete the customer after its dependent records.
        db.delete(customer)

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {
        "message": (
            "Customer, projects and measurements permanently deleted."
        )
    }
