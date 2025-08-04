import { User } from "@/types";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
// Add MoreHorizontal icon
import { MoreHorizontal } from "lucide-react";

// Update the actions type to include the new handler
export type UserTableActions = {
  onViewTeam: (user: User) => void;
  onRoleChange: (userId: number, newRole: string) => void;
  onResendInvitation: (userId: number) => void; // Add this line
};

// The function now accepts the current user as an argument
export const getUserTableColumns = (
  actions: UserTableActions,
  currentUser: User | null
): ColumnDef<User>[] => {
  return [
    {
      accessorKey: "full_name",
      header: "Name",
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Role
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const user = row.original;
        // The check is now done with the passed-in currentUser
        const isCurrentUser = currentUser?.id === user.id;

        return (
          <Select
            value={user.role}
            onValueChange={(newRole) => actions.onRoleChange(user.id, newRole)}
            disabled={isCurrentUser}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="team_admin">Team Admin</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                
                {/* Conditionally show "View Team" for team_admins */}
                {user.role === 'team_admin' && (
                  <DropdownMenuItem onClick={() => actions.onViewTeam(user)}>
                    View Team
                  </DropdownMenuItem>
                )}

                {/* Conditionally show "Resend Invitation" for inactive users */}
                {!user.is_active && (
                  <DropdownMenuItem onClick={() => actions.onResendInvitation(user.id)}>
                    Resend Invitation
                  </DropdownMenuItem>
                )}

              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
