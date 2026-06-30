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

interface TaskInputFieldBuilderProps {
  fields: TaskInputField[];
  onChange: (fields: TaskInputField[]) => void;
}

export function TaskInputFieldBuilder({ fields, onChange }: TaskInputFieldBuilderProps) {
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
        <Label className="text-sm font-medium">Task Input Fields</Label>
        {!isAddingNew && editingIndex === null && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={startAddingNew}
            data-testid="button-add-input-field"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        )}
      </div>

      {fields.length === 0 && !isAddingNew && (
        <div className="text-center py-8 text-sm text-gray-500 border rounded-md">
          No input fields defined. Click "Add Field" to create one.
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
                    <Badge variant="secondary">{field.type}</Badge>
                    {field.required && <Badge variant="outline">Required</Badge>}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Field name: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{field.name}</code>
                  </div>
                  {field.placeholder && (
                    <div className="text-sm text-gray-500 mt-1">
                      Placeholder: {field.placeholder}
                    </div>
                  )}
                  {field.options && field.options.length > 0 && (
                    <div className="text-sm text-gray-500 mt-1">
                      Options: {field.options.join(", ")}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
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
              {editingIndex !== null ? "Edit Field" : "Add New Field"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="field-name">Field Name *</Label>
                <Input
                  id="field-name"
                  value={currentField.name}
                  onChange={(e) => updateCurrentField({ name: e.target.value })}
                  placeholder="e.g., email"
                  data-testid="input-field-name"
                />
              </div>
              <div>
                <Label htmlFor="field-label">Field Label *</Label>
                <Input
                  id="field-label"
                  value={currentField.label}
                  onChange={(e) => updateCurrentField({ label: e.target.value })}
                  placeholder="e.g., Email Address"
                  data-testid="input-field-label"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="field-type">Field Type *</Label>
              <Select
                value={currentField.type}
                onValueChange={(value) => updateCurrentField({ type: value as FieldType })}
              >
                <SelectTrigger id="field-type" data-testid="select-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FieldType.TEXT}>Text</SelectItem>
                  <SelectItem value={FieldType.NUMBER}>Number</SelectItem>
                  <SelectItem value={FieldType.EMAIL}>Email</SelectItem>
                  <SelectItem value={FieldType.PASSWORD}>Password</SelectItem>
                  <SelectItem value={FieldType.DATE}>Date</SelectItem>
                  <SelectItem value={FieldType.TIME}>Time</SelectItem>
                  <SelectItem value={FieldType.SELECT}>Select (Dropdown)</SelectItem>
                  <SelectItem value={FieldType.CHECKLIST}>Checklist</SelectItem>
                  <SelectItem value={FieldType.RADIO}>Radio Buttons</SelectItem>
                  <SelectItem value={FieldType.FILE_UPLOAD}>File Upload</SelectItem>
                  <SelectItem value={FieldType.BUTTON}>Button</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="field-required"
                checked={currentField.required}
                onCheckedChange={(checked) => updateCurrentField({ required: !!checked })}
                data-testid="checkbox-field-required"
              />
              <Label htmlFor="field-required" className="cursor-pointer">
                Required field
              </Label>
            </div>

            <div>
              <Label htmlFor="field-placeholder">Placeholder</Label>
              <Input
                id="field-placeholder"
                value={currentField.placeholder || ""}
                onChange={(e) => updateCurrentField({ placeholder: e.target.value })}
                placeholder="Placeholder text"
                data-testid="input-field-placeholder"
              />
            </div>

            {showsOptions && (
              <div>
                <Label htmlFor="field-options">
                  Options * (comma-separated)
                </Label>
                <Input
                  id="field-options"
                  value={currentField.options?.join(", ") || ""}
                  onChange={(e) =>
                    updateCurrentField({
                      options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="Option 1, Option 2, Option 3"
                  data-testid="input-field-options"
                />
              </div>
            )}

            {showsMinMax && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field-min">Minimum Value</Label>
                  <Input
                    id="field-min"
                    type="number"
                    value={currentField.min ?? ""}
                    onChange={(e) => updateCurrentField({ min: e.target.value ? Number(e.target.value) : undefined })}
                    data-testid="input-field-min"
                  />
                </div>
                <div>
                  <Label htmlFor="field-max">Maximum Value</Label>
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
                  <Label htmlFor="field-min-length">Min Length</Label>
                  <Input
                    id="field-min-length"
                    type="number"
                    value={currentField.min_length ?? ""}
                    onChange={(e) => updateCurrentField({ min_length: e.target.value ? Number(e.target.value) : undefined })}
                    data-testid="input-field-min-length"
                  />
                </div>
                <div>
                  <Label htmlFor="field-max-length">Max Length</Label>
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
                  <Label htmlFor="field-accept">Accepted File Types</Label>
                  <Input
                    id="field-accept"
                    value={currentField.accept || ""}
                    onChange={(e) => updateCurrentField({ accept: e.target.value })}
                    placeholder="e.g., .pdf,.doc,.docx"
                    data-testid="input-field-accept"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="field-multiple"
                    checked={currentField.multiple}
                    onCheckedChange={(checked) => updateCurrentField({ multiple: !!checked })}
                    data-testid="checkbox-field-multiple"
                  />
                  <Label htmlFor="field-multiple" className="cursor-pointer">
                    Allow multiple files
                  </Label>
                </div>
              </>
            )}

            {showsButton && (
              <div>
                <Label htmlFor="field-button-text">Button Text</Label>
                <Input
                  id="field-button-text"
                  value={currentField.button_text || ""}
                  onChange={(e) => updateCurrentField({ button_text: e.target.value })}
                  placeholder="Click Me"
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
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="button"
                onClick={editingIndex !== null ? handleUpdateField : handleAddField}
                data-testid="button-save-field"
              >
                <Check className="h-4 w-4 mr-2" />
                {editingIndex !== null ? "Update" : "Add"} Field
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
