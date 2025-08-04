import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// This is the shape of the data from our new /api/admin/provider-services endpoint
export interface ProviderServiceAdmin {
  id: number;
  provider_name: string;
  service_name: string;
  model_api_id: string;
  display_name: string;
  is_active: boolean;
}

// Define the actions that can be performed from the table
export type ServiceColumnActions = {
  onToggleActive: (serviceId: number, currentStatus: boolean) => void;
  onDelete: (serviceId: number, displayName: string) => void;
  // onEdit: (service: ProviderServiceAdmin) => void; // We'll add this later
};

export const getServiceManagementColumns = (actions: ServiceColumnActions): ColumnDef<ProviderServiceAdmin>[] => [
  {
    accessorKey: "display_name",
    header: "Display Name",
    cell: ({ row }) => <div className="font-medium">{row.original.display_name}</div>
  },
  {
    accessorKey: "provider_name",
    header: "Provider",
    cell: ({ row }) => <Badge variant="outline">{row.original.provider_name}</Badge>
  },
  {
    accessorKey: "service_name",
    header: "Service Type",
  },
  {
    accessorKey: "model_api_id",
    header: "Model API ID",
    cell: ({ row }) => <code className="text-sm">{row.original.model_api_id}</code>
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Switch
          checked={row.original.is_active}
          onCheckedChange={(newStatus) => actions.onToggleActive(row.original.id, newStatus)}
        />
        <span className="text-xs text-muted-foreground">{row.original.is_active ? "Active" : "Inactive"}</span>
      </div>
    )
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => alert("Edit functionality coming soon!")}>
              Edit Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actions.onDelete(row.original.id, row.original.display_name)}
              className="text-red-600 focus:text-red-600"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
  },
];