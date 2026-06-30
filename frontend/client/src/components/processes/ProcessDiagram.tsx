import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProcessInputItem, ProcessOutputItem, ProcessType, ProcessTypeLabels } from "@/types/process";
import { apiRequest } from "@/lib/queryClient";
import { ArrowRight, Package, Factory } from "lucide-react";

interface ProcessDiagramProps {
  inputs: ProcessInputItem[];
  outputs: ProcessOutputItem[];
  processType: ProcessType;
}

const inputColors = [
  "bg-blue-100 border-blue-300 text-blue-800",
  "bg-green-100 border-green-300 text-green-800", 
  "bg-orange-100 border-orange-300 text-orange-800",
  "bg-purple-100 border-purple-300 text-purple-800",
  "bg-pink-100 border-pink-300 text-pink-800",
  "bg-yellow-100 border-yellow-300 text-yellow-800",
  "bg-indigo-100 border-indigo-300 text-indigo-800",
  "bg-teal-100 border-teal-300 text-teal-800",
];

const outputColors = [
  "bg-blue-200 border-blue-400 text-blue-900",
  "bg-green-200 border-green-400 text-green-900",
  "bg-orange-200 border-orange-400 text-orange-900", 
  "bg-purple-200 border-purple-400 text-purple-900",
  "bg-pink-200 border-pink-400 text-pink-900",
  "bg-yellow-200 border-yellow-400 text-yellow-900",
  "bg-indigo-200 border-indigo-400 text-indigo-900",
  "bg-teal-200 border-teal-400 text-teal-900",
];

export function ProcessDiagram({ inputs, outputs, processType }: ProcessDiagramProps) {
  // Fetch material names for display
  const { data: materials } = useQuery({
    queryKey: ["/material/"],
    queryFn: () => apiRequest("/material/?per_page=100"),
  });

  const getMaterialName = (materialUuid: string) => {
    const material = materials?.materials?.find((m: any) => m.uuid === materialUuid);
    return material?.name || materialUuid.slice(0, 8);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Factory className="h-5 w-5" />
          Process Flow Diagram
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center space-y-8">
          {/* Title */}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Manufacturing Process System
            </h3>
          </div>

          {/* Main Process Flow */}
          <div className="flex items-center justify-between w-full max-w-6xl">
            {/* INPUTS Section */}
            <div className="flex-1 space-y-4">
              <div className="text-center">
                <h4 className="text-sm font-medium text-gray-600 uppercase tracking-wider mb-4">
                  INPUTS
                </h4>
              </div>
              <div className="space-y-3">
                {inputs.map((input, index) => (
                  <div key={index} className="flex items-center justify-end">
                    <div className={`px-4 py-2 rounded-lg border-2 ${inputColors[index % inputColors.length]} min-w-[150px] text-center`}>
                      <div className="font-medium text-sm">
                        {getMaterialName(input.material_uuid)}
                      </div>
                      <div className="text-xs opacity-75">
                        Qty: {input.quantity.toLocaleString()}
                      </div>
                      {input.cost_per_unit && (
                        <div className="text-xs opacity-75">
                          Cost: {input.cost_per_unit.toLocaleString()} SYP/unit
                        </div>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 ml-2" />
                  </div>
                ))}
              </div>
            </div>

            {/* PROCESS Section */}
            <div className="flex-1 flex justify-center px-8">
              <div className="bg-white border-4 border-gray-800 rounded-2xl p-6 text-center min-w-[250px] shadow-lg">
                <div className="text-lg font-bold text-gray-800 mb-4">
                  {ProcessTypeLabels[processType] || processType}
                </div>
                <div className="flex justify-center space-x-2 mb-4">
                  <div className="w-4 h-4 bg-green-400 rounded-full"></div>
                  <div className="w-4 h-4 bg-blue-400 rounded-full"></div>
                  <div className="w-4 h-4 bg-orange-400 rounded-full"></div>
                  <div className="w-4 h-4 bg-pink-400 rounded-full"></div>
                  <div className="w-4 h-4 bg-purple-400 rounded-full"></div>
                </div>
                <div className="text-sm text-gray-600 font-medium">
                  Blend • Mix • Combine
                </div>
              </div>
            </div>

            {/* OUTPUTS Section */}
            <div className="flex-1 space-y-4">
              <div className="text-center">
                <h4 className="text-sm font-medium text-gray-600 uppercase tracking-wider mb-4">
                  OUTPUTS
                </h4>
              </div>
              <div className="space-y-3">
                {outputs.map((output, index) => (
                  <div key={index} className="flex items-center">
                    <ArrowRight className="h-4 w-4 text-gray-400 mr-2" />
                    <div className={`px-4 py-2 rounded-lg border-2 ${outputColors[index % outputColors.length]} min-w-[150px] text-center`}>
                      <div className="font-medium text-sm">
                        {getMaterialName(output.material_uuid)}
                      </div>
                      <div className="text-xs opacity-75">
                        Qty: {output.quantity.toLocaleString()}
                      </div>
                      {output.cost_per_unit && (
                        <div className="text-xs opacity-75">
                          Cost: {output.cost_per_unit.toLocaleString()} SYP/unit
                        </div>
                      )}
                      {output.total_cost && (
                        <div className="text-xs opacity-75">
                          Total: {output.total_cost.toLocaleString()} SYP
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Process Summary */}
          <div className="text-center text-sm text-gray-500 mt-6">
            <div className="flex items-center justify-center space-x-2">
              <span>Multiple inputs</span>
              <ArrowRight className="h-3 w-3" />
              <span>Single process</span>
              <ArrowRight className="h-3 w-3" />
              <span>Multiple outputs</span>
            </div>
          </div>

          {/* Process Stats */}
          <div className="flex justify-center space-x-8 mt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{inputs.length}</div>
              <div className="text-xs text-gray-500">Input Materials</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{outputs.length}</div>
              <div className="text-xs text-gray-500">Output Products</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {inputs.reduce((sum, input) => sum + input.quantity, 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Total Input Qty</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {outputs.reduce((sum, output) => sum + output.quantity, 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Total Output Qty</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}