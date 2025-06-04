from app.domains.task_execution.callback_functions.create_process_from_workflow import create_process_from_workflow
from app.domains.task_execution.callback_functions.quality_control_create import quality_control_create
from app.domains.task_execution.callback_functions.consume_packaging_from_output import consume_packaging_from_output

CALLBACK_FN_MAPPER = {
    "create_process_from_workflow": create_process_from_workflow,
    "quality_control_create": quality_control_create,
    "consume_packaging_from_output": consume_packaging_from_output
}

