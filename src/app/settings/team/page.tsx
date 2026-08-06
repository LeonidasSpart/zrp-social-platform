"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  UserPlus,
  MoreVertical,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserMinus,
  Crown,
  Loader2,
} from "lucide-react";

interface TeamMember {
  id: string;
  accountId: string;
  userId: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  createdAt: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    plan: string;
  };
}

interface TeamOwner {
  id: string;
  username: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  plan: string;
  role: "OWNER";
}

export default function TeamSettingsPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [owner, setOwner] = useState<TeamOwner | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingMember, setAddingMember] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">("VIEWER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  // ─── Check if user has team management permission ──────────────
  useEffect(() => {
    if (session?.user && !session.user.features?.teamManagement) {
      toast({
        title: "Upgrade Required",
        description: "Team management is available on Business and Enterprise plans.",
        variant: "destructive",
      });
      router.push("/pricing?feature=team");
    }
  }, [session, router, toast]);

  // ─── Fetch team members ──────────────────────────────────────────
  const fetchTeam = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/team");
      if (!res.ok) {
        if (res.status === 403) {
          toast({
            title: "Upgrade Required",
            description: "Team management requires a Business or Enterprise plan.",
            variant: "destructive",
          });
          router.push("/pricing?feature=team");
          return;
        }
        throw new Error("Failed to fetch team");
      }
      const data = await res.json();
      setMembers(data.members || []);
      setOwner(data.owner || null);
    } catch (error) {
      console.error("Error fetching team:", error);
      toast({
        title: "Error",
        description: "Failed to load team members.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.features?.teamManagement) {
      fetchTeam();
    }
  }, [session]);

  // ─── Add team member ─────────────────────────────────────────────
  const handleAddMember = async () => {
    if (!newMemberEmail) {
      toast({
        title: "Error",
        description: "Please enter an email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newMemberEmail.trim(),
          role: newMemberRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add member");
      }

      toast({
        title: "Member Added",
        description: `${data.member.user.email} has been added to your team.`,
      });

      setShowAddDialog(false);
      setNewMemberEmail("");
      setNewMemberRole("VIEWER");
      fetchTeam();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add member.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Update member role ──────────────────────────────────────────
  const handleUpdateRole = async (memberId: string, role: "ADMIN" | "EDITOR" | "VIEWER") => {
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update role");
      }

      toast({
        title: "Role Updated",
        description: `Member role has been updated to ${role}.`,
      });

      fetchTeam();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update role.",
        variant: "destructive",
      });
    }
  };

  // ─── Remove team member ──────────────────────────────────────────
  const handleRemoveMember = async () => {
    if (!removeTarget) return;

    try {
      const res = await fetch(`/api/team/${removeTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }

      toast({
        title: "Member Removed",
        description: `${removeTarget.user.email} has been removed from your team.`,
      });

      setShowRemoveDialog(false);
      setRemoveTarget(null);
      fetchTeam();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove member.",
        variant: "destructive",
      });
    }
  };

  // ─── Helper: Role badge ──────────────────────────────────────────
  const getRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER":
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600">
            <Crown className="w-3 h-3 mr-1" />
            Owner
          </Badge>
        );
      case "ADMIN":
        return (
          <Badge className="bg-red-500 hover:bg-red-600">
            <ShieldAlert className="w-3 h-3 mr-1" />
            Admin
          </Badge>
        );
      case "EDITOR":
        return (
          <Badge className="bg-blue-500 hover:bg-blue-600">
            <ShieldCheck className="w-3 h-3 mr-1" />
            Editor
          </Badge>
        );
      case "VIEWER":
        return (
          <Badge variant="outline">
            <Shield className="w-3 h-3 mr-1" />
            Viewer
          </Badge>
        );
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  // ─── Helper: Role options for dropdown ──────────────────────────
  const roleOptions = [
    { value: "ADMIN", label: "Admin" },
    { value: "EDITOR", label: "Editor" },
    { value: "VIEWER", label: "Viewer" },
  ];

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.charAt(0).toUpperCase();
    return email.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  const isOwner = true; // The current user is always the owner when viewing their own team

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team members and their permissions.
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Invite a user to join your team by their email address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Address</label>
                <Input
                  placeholder="user@example.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <Select
                  value={newMemberRole}
                  onValueChange={(val: "ADMIN" | "EDITOR" | "VIEWER") =>
                    setNewMemberRole(val)
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="EDITOR">Editor</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Member"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Team Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length !== 1 ? "s" : ""} on your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Owner row */}
              {owner && (
                <TableRow className="bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={owner.avatarUrl || undefined} />
                        <AvatarFallback>
                          {getInitials(owner.name, owner.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {owner.name || owner.username}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{owner.username}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{owner.email}</TableCell>
                  <TableCell>{getRoleBadge("OWNER")}</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    Account Owner
                  </TableCell>
                </TableRow>
              )}

              {/* Member rows */}
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.user.avatarUrl || undefined} />
                        <AvatarFallback>
                          {getInitials(member.user.name, member.user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {member.user.name || member.user.username}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{member.user.username}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{member.user.email}</TableCell>
                  <TableCell>{getRoleBadge(member.role)}</TableCell>
                  <TableCell>
                    {new Date(member.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {roleOptions.map((opt) => (
                          <DropdownMenuItem
                            key={opt.value}
                            onClick={() => handleUpdateRole(member.id, opt.value as any)}
                            className={member.role === opt.value ? "bg-muted" : ""}
                          >
                            {opt.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            setRemoveTarget(member);
                            setShowRemoveDialog(true);
                          }}
                        >
                          <UserMinus className="w-4 h-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}

              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No team members yet. Invite your first member to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Plan Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Team Plan Information</CardTitle>
          <CardDescription>
            Your current plan determines team management capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Current Plan</p>
              <p className="text-sm text-muted-foreground capitalize">
                {session?.user?.plan || "Free"}
              </p>
            </div>
            <Badge
              variant={session?.user?.features?.teamManagement ? "default" : "destructive"}
              className="text-sm"
            >
              {session?.user?.features?.teamManagement
                ? "Team Management Enabled"
                : "Upgrade Required"}
            </Badge>
          </div>

          {!session?.user?.features?.teamManagement && (
            <Button
              variant="default"
              className="w-full"
              onClick={() => router.push("/pricing")}
            >
              Upgrade to Business or Enterprise
            </Button>
          )}

          <div className="text-xs text-muted-foreground">
            <p>
              <strong>Owner:</strong> Full control over the team. Can add, remove, and change roles.
            </p>
            <p>
              <strong>Admin:</strong> Can add/remove members and change roles (except the owner).
            </p>
            <p>
              <strong>Editor:</strong> Can create and manage team content.
            </p>
            <p>
              <strong>Viewer:</strong> Can view team content only.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>{removeTarget?.user.email}</strong> from your team?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
