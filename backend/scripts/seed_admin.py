"""Idempotently create a local admin user so the stack is usable after a fresh migrate.

Run inside the backend container (needs SQLALCHEMY_DATABASE_URI set), after migrations:
    python scripts/seed_admin.py

Credentials are taken from env (with local defaults):
    SEED_ADMIN_USERNAME (default: admin)
    SEED_ADMIN_PASSWORD (default: admin)
"""
import os

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import User


USERNAME = os.getenv("SEED_ADMIN_USERNAME", "admin")
PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "admin")
EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@karma.local")


def main() -> None:
    with SqlAlchemyUnitOfWork() as uow:
        existing = uow.user_repository.find_one(username=USERNAME)
        if existing:
            print(f"[seed] user {USERNAME!r} already exists, skipping")
            return

        user = User(
            username=USERNAME,
            first_name="Admin",
            last_name="User",
            # full access: is_admin checks for "admin"/"superuser" in this list
            permission_scope="superuser,admin",
            email=EMAIL,
        )
        user.set_password(PASSWORD)
        uow.user_repository.save(model=user, commit=True)
        print(f"[seed] created admin user {USERNAME!r} (password: {PASSWORD!r})")


if __name__ == "__main__":
    main()
