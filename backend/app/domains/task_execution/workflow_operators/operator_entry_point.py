from app.dto.task_execution import OperatorType
from app.domains.task_execution.workflow_operators.io_process_operator import IOProcessOperator
from app.dto.task_execution import TaskExecutionComplete
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from app.entrypoint.routes.common.errors import BadRequestError


class OperatorEntryPoint:

    def __init__(self):
            """
            Initializes the OperatorEntryPoint with the given operator.

            :param operator: The operator instance to be used.
            """
            self.mapper = {
                OperatorType.IO_PROCESS_OPERATOR: IOProcessOperator(),
            }


    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload: TaskExecutionComplete,
                operator_type: OperatorType,
                *args,
                **kwargs):

        """
        Executes the operator based on its type.

        :param operator_type: The type of the operator to execute.
        :return: The result of the operator execution.
        """
        if operator_type not in self.mapper:
            raise BadRequestError(f"Operator type {operator_type} is not supported.")

        return self.mapper[operator_type].execute(uow, payload, *args, **kwargs)



