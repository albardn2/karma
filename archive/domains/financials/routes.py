# app/domains/hello/routes.py
from flask import Blueprint, request, jsonify
from app.domains.financials import financials_blueprint
from pydantic import BaseModel, ValidationError
from app.repositories import google_sheet_repository
from app.repositories.google_sheets_repository import TableSheets


class GetTableQuery(BaseModel):
    table: str

@financials_blueprint.route('/get-table', methods=['GET'])
def get_table_data():
    # Validate query parameters using Pydantic
    try:
        query_params = GetTableQuery(**request.args)
    except ValidationError as e:
        # Return validation errors as JSON with status code 422 (Unprocessable Entity)
        return jsonify(e.errors()), 422

    table_name = query_params.table
    df = google_sheet_repository.get_all(TableSheets(table_name))
    return jsonify(df.to_dict(orient='records'))



class Account(BaseModel):
    id: str
    timestamp: str
    email_address: str
    account_name: str
    is_external: bool
    currency: str

@financials_blueprint.route('/account-list', methods=['GET'])
def get_account_ids_list():
    df = google_sheet_repository.get_all(TableSheets.ACCOUNTS)
    # map to Account model: # id	Timestamp	Email Address	account name	is_external	currency
    df.columns = ['id', 'timestamp', 'email_address', 'account_name', 'is_external', 'currency']

    # Convert DataFrame to list of Account models
    accounts = df.to_dict(orient='records')
    try:
        _ = [Account(**account) for account in accounts]
    except ValidationError as e:
        # Return validation errors as JSON with status code 422 (Unprocessable Entity)
        return jsonify(e.errors()), 422

    return jsonify(accounts)

