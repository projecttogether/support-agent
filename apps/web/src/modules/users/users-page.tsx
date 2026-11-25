import { useState } from "react";
import { Lock, MoreHorizontal, Plus, Trash2, UserCheck, UserX, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { ROLES, type Role } from "@support-agent/shared/roles";
import type { User } from "@support-agent/shared/api/users";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Page, PageHeader } from "@/components/ui/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";
import { useT } from "@/i18n";
import { common } from "@/i18n/common";
import { errorMessage } from "@/lib/api";
import { useFormatter } from "@/lib/format";
import { useDeleteUser, useUpdateUser, useUsers } from "./api";
import { AddUserDialog } from "./add-user-dialog";
import { messages } from "./messages";

function UserRow({ user, onDelete }: { user: User; onDelete: () => void }) {
  const t = useT(messages);
  const tc = useT(common);
  const format = useFormatter();
  const me = useMe();
  const update = useUpdateUser();
  const isMe = user.id === me.id;
  const locked = user.fromEnvironment;
  const label = user.name || user.email;

  const change = async (input: { role?: Role; isActive?: boolean }, success: string) => {
    try {
      await update.mutateAsync({ id: user.id, ...input });
      toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <TableRow>
      <TableCell className="max-w-72 whitespace-normal">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{label}</span>
          {isMe ? <Badge variant="outline">{t("you")}</Badge> : null}
        </div>
        {user.name ? <div className="text-muted-foreground text-xs break-all">{user.email}</div> : null}
        {locked ? (
          <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
            <Lock className="size-3" aria-hidden />
            {t("fromEnvironment")}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <Select
          value={user.role}
          disabled={locked || isMe || update.isPending}
          onValueChange={(role) => void change({ role: role as Role }, t("roleChanged"))}
        >
          <SelectTrigger className="w-36" aria-label={t("roleFor", { name: label })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {t(`role_${role}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {user.isActive ? (
          <Badge variant="outline" className="bg-success/15 text-success border-success/30">
            {t("active")}
          </Badge>
        ) : (
          <Badge variant="secondary">{t("inactive")}</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {user.lastSignInAt ? (
          <span title={format.dateTime(user.lastSignInAt)}>{format.relative(user.lastSignInAt)}</span>
        ) : (
          t("neverSignedIn")
        )}
      </TableCell>
      <TableCell className="text-right">
        {locked || isMe ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("actionsFor", { name: label })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {user.isActive ? (
                <DropdownMenuItem
                  onSelect={() => void change({ isActive: false }, t("deactivated", { name: label }))}
                >
                  <UserX />
                  {t("deactivate")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => void change({ isActive: true }, t("reactivated", { name: label }))}
                >
                  <UserCheck />
                  {t("reactivate")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                {tc("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

export function UsersPage() {
  const t = useT(messages);
  const tc = useT(common);
  const users = useUsers();
  const remove = useDeleteUser();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <Plus />
      {t("add")}
    </Button>
  );

  return (
    <Page>
      <PageHeader title={t("title")} description={t("description")} actions={addButton} />
      {users.isLoading ? (
        <LoadingState />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : !users.data?.length ? (
        <EmptyState icon={<UsersRound />} title={t("empty")} action={addButton} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colPerson")}</TableHead>
                <TableHead>{t("colRole")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colLastSignIn")}</TableHead>
                <TableHead>
                  <span className="sr-only">{tc("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.map((user) => (
                <UserRow key={user.id} user={user} onDelete={() => setDeleting(user)} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {adding ? <AddUserDialog onClose={() => setAdding(false)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteTitle", { name: deleting ? deleting.name || deleting.email : "" })}
        description={t("deleteText")}
        destructive
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(t("deleted"));
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </Page>
  );
}
