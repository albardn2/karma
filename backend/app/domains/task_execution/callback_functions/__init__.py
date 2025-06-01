from app.domains.task_execution.callback_functions.create_process_from_workflow import create_process_from_workflow
from app.domains.task_execution.callback_functions.quality_control_create import quality_control_create

CALLBACK_FN_MAPPER = {
    "create_process_from_workflow": create_process_from_workflow,
    "quality_control_create": quality_control_create
}

