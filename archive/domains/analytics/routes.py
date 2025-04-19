# app/domains/hello/routes.py
from flask import Blueprint, request, jsonify
from app.domains.analytics import analytics_blueprint
from app.domains.financials.domain import FinancialsDomain
from app.domains.analytics.chart_interfaces import Chart, BarChart, BarChartData, LineChart, LineChartData, PieChart, PieChartData, NumberChart

from app.domains.analytics.chart_interfaces import NumberChartData
from pydantic import BaseModel












@analytics_blueprint.route('/account-balance', methods=['GET'])
def get_account_balances_chart():

    # request param account id
    account_id = request.args.get('account_id')
    if not account_id:
        return jsonify({'message': 'Account ID is required'}), 400

    financials_domain = FinancialsDomain()
    account_balance = financials_domain.get_account_balance(account_id=account_id)

    # number chart
    chart = NumberChart(
        title="Account Balance",
        data=NumberChartData(value=account_balance)
    )
    return jsonify(chart.dict())


@analytics_blueprint.route('/account-balance-timeseries', methods=['GET'])
def get_account_balances_timeseries_chart():

    # request param account id
    account_id = request.args.get('account_id')
    if not account_id:
        return jsonify({'message': 'Account ID is required'}), 400

    financials_domain = FinancialsDomain()
    account_balances_timeseries = financials_domain.generate_balance_cumulitive_sum(account_id=account_id)
    # returns tuple(balance, date)

    # line chart
    chart = LineChart(
        title="Account Balance Over Time",
        data=LineChartData(
            labels=[date for _, date in account_balances_timeseries],
            values=[balance for balance, _ in account_balances_timeseries]
        )
    )
    return jsonify(chart.dict())

# get barchart of account balance delta over time grouped by Month
@analytics_blueprint.route('/account-balance-delta-monthly', methods=['GET'])
def get_account_balances_delta_monthly_chart():
        # request param account id
        account_id = request.args.get('account_id')
        if not account_id:
            return jsonify({'message': 'Account ID is required'}), 400

        financials_domain = FinancialsDomain()
        account_balances_delta_monthly = financials_domain.generate_balance_delta_monthly(account_id=account_id)
        # returns tuple(balance, date)

        # line chart
        chart = BarChart(
            title="Account Balance Delta Monthly",
            data=BarChartData(
                labels=[date for _, date in account_balances_delta_monthly],
                values=[balance for balance, _ in account_balances_delta_monthly]
            )
        )
        return jsonify(chart.dict())



# @analytics_blueprint.route('/account-balance-time-grouped-chart', methods=['GET'])
# def get_account_balances_timeseries_chart():
#     return jsonify({'message': 'Hello World'})