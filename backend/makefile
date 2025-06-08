# Makefile for Alembic migrations

# You can override ALEMBIC and MSG on the command line, e.g.:
#   make revision MSG="Add users table"
ALEMBIC ?= alembic
MSG     ?= "Auto migration"

.PHONY: revision upgrade

## Create a new migration, auto-generating based on your models.
## Usage: make revision MSG="Describe your migration"
revision:
	@echo ">>> Generating new migration: $(MSG)"
	$(ALEMBIC) revision --autogenerate -m "$(MSG)"

## Apply all pending migrations (upgrade to head)
upgrade:
	@echo ">>> Upgrading database to head"
	$(ALEMBIC) upgrade head
