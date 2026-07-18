import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { FieldType, TaskInputField } from "@/types/taskInputs";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";

interface TaskInputFieldBuilderProps {
  fields: TaskInputField[];
  onChange: (fields: TaskInputField[]) => void;
}

export function TaskInputFieldBuilder({ fields, onChange }: TaskInputFieldBuilderProps) {
  const { t } = useLanguage();
  const fieldTypeLabel = (type: FieldType | string) => t(`workflows.fieldType_${type}`);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [currentField, setCurrentField] = useState<TaskInputField>({
    name: "",
    label: "",
    type: FieldType.TEXT,
    required: false,
  });

  const resetCurrentField = () => {
    setCurrentField({
      name: "",
      label: "",
      type: FieldType.TEXT,
      required: false,
    });
  };

  const handleAddField = () => {
    if (!currentField.name || !currentField.label) {
      return;
    }
    
    // Validate that select/checklist/radio fields have at least one option
    const needsOptions = [FieldType.SELECT, FieldType.CHECKLIST, FieldType.RADIO].includes(currentField.type);
    if (needsOptions && (!currentField.options || currentField.options.length === 0)) {
      return;
    }
    
    onChange([...fields, currentField]);
    resetCurrentField();
    setIsAddingNew(false);
  };

  const handleUpdateField = () => {
    if (editingIndex === null || !currentField.name || !currentField.label) {
      return;
    }
    
    // Validate that select/checklist/radio fields have at least one option
    const needsOptions = [FieldType.SELECT, FieldType.CHECKLIST, FieldType.RADIO].includes(currentField.type);
    if (needsOptions && (!currentField.options || currentField.options.length === 0)) {
      return;
    }
    
    const updated = [...fields];
    updated[editingIndex] = currentField;
    onChange(updated);
    resetCurrentField();
    setEditingIndex(null);
  };

  const handleDeleteField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const handleEditField = (index: number) => {
    setCurrentField({ ...fields[index] });
    setEditingIndex(index);
    setIsAddingNew(false);
  };

  const handleCancel = () => {
    resetCurrentField();
    setEditingIndex(null);
    setIsAddingNew(false);
  };

  const startAddingNew = () => {
    resetCurrentField();
    setEditingIndex(null);
    setIsAddingNew(true);
  };

  const updateCurrentField = (updates: Partial<TaskInputField>) => {
    setCurrentField({ ...currentField, ...updates });
  };

  const showsOptions = [FieldType.SELECT, FieldType.CHECKLIST, FieldType.RADIO].includes(currentField.type);
  const showsMinMax = [FieldType.NUMBER].includes(currentField.type);
  const showsFileUpload = currentField.type === FieldType.FILE_UPLOAD;
  const showsButton = currentField.type === FieldType.BUTTON;
  const showsTextConstraints = [FieldType.TEXT, FieldType.EMAIL, FieldType.PASSWORD].includes(currentField.type);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Label className="text-sm font-medium">{t('workflows.taskInputFields')}</Label>
        {!isAddingNew && editingIndex === null && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={startAddingNew}
            data-testid="button-add-input-field"
          >
            <Plus className="h-4 w-4 me-2" />
            {t('workflows.addField')}
          </Button>
        )}
      </div>

      {fields.length === 0 && !isAddingNew && (
        <div className="text-center py-8 text-sm text-gray-500 border rounded-md">
          {t('workflows.noInputFieldsDefined')}
        </div>
      )}

      {fields.map((field, index) => {
        if (editingIndex === index) return null;
        
        return (
          <Card key={index} className="bg-gray-50 dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium" data-testid={`field-name-${field.name}`}>
                      {field.label}
                    </span>
                    <Badge variant="secondary">{fieldTypeLabel(field.type)}</Badge>
                    {field.required && <Badge variant="outline">{t('common.required')}</Badge>}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {t('workflows.fieldNameColon')} <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{field.name}</code>
                  </div>
                  {field.placeholder && (
                    <div className="text-sm text-gray-500 mt-1">
                      {t('workflows.placeholderColon')} {field.placeholder}
                    </div>
                  )}
                  {field.options && field.options.length > 0 && (
                    <div className="text-sm text-gray-500 mt-1">
                      {t('workflows.optionsColon')} {field.options.join(", ")}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ms-4">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditField(index)}
                    data-testid={`button-edit-field-${field.name}`}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => handleDeleteField(index)}
                    data-testid={`button-delete-field-${field.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {(isAddingNew || editingIndex !== null) && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="text-base">
              {editingIndex !== null ? t('workflows.editField') : t('workflows.addNewField')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="field-name">{t('workflows.fieldName')} *</Label>
                <Input
                  id="field-name"
                  value={currentField.name}
                  onChange={(e) => updateCurrentField({ name: e.target.value })}
                  placeholder={t('workflows.fieldNamePlaceholder')}
                  data-testid="input-field-name"
                />
              </div>
              <div>
                <Label htmlFor="field-label">{t('workflows.fieldLabel')} *</Label>
                <Input
                  id="field-label"
                  value={currentField.label}
                  onChange={(e) => updateCurrentField({ label: e.target.value })}
                  placeholder={t('workflows.fieldLabelPlaceholder')}
                  data-testid="input-field-label"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="field-type">{t('workflows.fieldType')} *</Label>
              <Select
                value={currentField.type}
                onValueChange={(value) => updateCurrentField({ type: value as FieldType })}
              >
                <SelectTrigger id="field-type" data-testid="select-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FieldType.TEXT}>{t('workflows.fieldType_text')}</SelectItem>
                  <SelectItem value={FieldType.NUMBER}>{t('workflows.fieldType_number')}</SelectItem>
                  <SelectItem value={FieldType.EMAIL}>{t('workflows.fieldType_email')}</SelectItem>
                  <SelectItem value={FieldType.PASSWORD}>{t('workflows.fieldType_password')}</SelectItem>
                  <SelectItem value={FieldType.DATE}>{t('workflows.fieldType_date')}</SelectItem>
                  <SelectItem value={FieldType.TIME}>{t('workflows.fieldType_time')}</SelectItem>
                  <SelectItem value={FieldType.SELECT}>{t('workflows.fieldType_select')}</SelectItem>
                  <SelectItem value={FieldType.CHECKLIST}>{t('workflows.fieldType_checklist')}</SelectItem>
                  <SelectItem value={FieldType.RADIO}>{t('workflows.fieldType_radio')}</SelectItem>
                  <SelectItem value={FieldType.FILE_UPLOAD}>{t('workflows.fieldType_file_upload')}</SelectItem>
                  <SelectItem value={FieldType.BUTTON}>{t('workflows.fieldType_button')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Checkbox
                id="field-required"
                checked={currentField.required}
                onCheckedChange={(checked) => updateCurrentField({ required: !!checked })}
                data-testid="checkbox-field-required"
              />
              <Label htmlFor="field-required" className="cursor-pointer">
                {t('workflows.requiredField')}
              </Label>
            </div>

            <div>
              <Label htmlFor="field-placeholder">{t('workflows.placeholder')}</Label>
              <Input
                id="field-placeholder"
                value={currentField.placeholder || ""}
                onChange={(e) => updateCurrentField({ placeholder: e.target.value })}
                placeholder={t('workflows.placeholderTextPlaceholder')}
                data-testid="input-field-placeholder"
              />
            </div>

            {showsOptions && (
              <div>
                <Label htmlFor="field-options">
                  {t('workflows.optionsCommaSeparated')}
                </Label>
                <Input
                  id="field-options"
                  value={currentField.options?.join(", ") || ""}
                  onChange={(e) =>
                    updateCurrentField({
                      options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder={t('workflows.optionsPlaceholder')}
                  data-testid="input-field-options"
                />
              </div>
            )}

            {showsMinMax && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field-min">{t('workflows.minValue')}</Label>
                  <Input
                    id="field-min"
                    type="number"
                    value={currentField.min ?? ""}
                    onChange={(e) => updateCurrentField({ min: e.target.value ? Number(e.target.value) : undefined })}
                    data-testid="input-field-min"
                  />
                </div>
                <div>
                  <Label htmlFor="field-max">{t('workflows.maxValue')}</Label>
                  <Input
                    id="field-max"
                    type="number"
                    value={currentField.max ?? ""}
                    onChange={(e) => updateCurrentField({ max: e.target.value ? Number(e.target.value) : undefined })}
                    data-testid="input-field-max"
                  />
                </div>
              </div>
            )}

            {showsTextConstraints && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field-min-length">{t('workflows.minLength')}</Label>
                  <Input
                    id="field-min-length"
                    type="number"
                    value={currentField.min_length ?? ""}
                    onChange={(e) => updateCurrentField({ min_length: e.target.value ? Number(e.target.value) : undefined })}
                    data-testid="input-field-min-length"
                  />
                </div>
                <div>
                  <Label htmlFor="field-max-length">{t('workflows.maxLength')}</Label>
                  <Input
                    id="field-max-length"
                    type="number"
                    value={currentField.max_length ?? ""}
                    onChange={(e) => updateCurrentField({ max_length: e.target.value ? Number(e.target.value) : undefined })}
                    data-testid="input-field-max-length"
                  />
                </div>
              </div>
            )}

            {showsFileUpload && (
              <>
                <div>
                  <Label htmlFor="field-accept">{t('workflows.acceptedFileTypes')}</Label>
                  <Input
                    id="field-accept"
                    value={currentField.accept || ""}
                    onChange={(e) => updateCurrentField({ accept: e.target.value })}
                    placeholder={t('workflows.acceptedFileTypesPlaceholder')}
                    data-testid="input-field-accept"
                  />
                </div>
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <Checkbox
                    id="field-multiple"
                    checked={currentField.multiple}
                    onCheckedChange={(checked) => updateCurrentField({ multiple: !!checked })}
                    data-testid="checkbox-field-multiple"
                  />
                  <Label htmlFor="field-multiple" className="cursor-pointer">
                    {t('workflows.allowMultipleFiles')}
                  </Label>
                </div>
              </>
            )}

            {showsButton && (
              <div>
                <Label htmlFor="field-button-text">{t('workflows.buttonText')}</Label>
                <Input
                  id="field-button-text"
                  value={currentField.button_text || ""}
                  onChange={(e) => updateCurrentField({ button_text: e.target.value })}
                  placeholder={t('workflows.buttonTextPlaceholder')}
                  data-testid="input-field-button-text"
                />
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                data-testid="button-cancel-field"
              >
                <X className="h-4 w-4 me-2" />
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={editingIndex !== null ? handleUpdateField : handleAddField}
                data-testid="button-save-field"
              >
                <Check className="h-4 w-4 me-2" />
                {editingIndex !== null ? t('workflows.updateField') : t('workflows.addField')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
