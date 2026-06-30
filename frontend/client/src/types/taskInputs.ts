export enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  EMAIL = 'email',
  PASSWORD = 'password',
  BUTTON = 'button',
  FILE_UPLOAD = 'file_upload',
  CHECKLIST = 'checklist',
  RADIO = 'radio',
  DATE = 'date',
  TIME = 'time',
  SELECT = 'select',
}

export interface TaskInputField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: string[];
  button_text?: string;
  multiple?: boolean;
  accept?: string;
  rows?: number;
  cols?: number;
  min_length?: number;
  max_length?: number;
}
