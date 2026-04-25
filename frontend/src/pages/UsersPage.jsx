/**
 * UsersPage.jsx — Gestión de usuarios (solo administradores)
 * CRUD completo: listar, crear, editar rol, desactivar (soft delete)
 * Estilo consistente con AuditFormPage (glassmorphism, animaciones, colores)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Edit, Trash2, Loader2, UserPlus, Shield, ShieldOff,
  Eye, EyeOff, X, CheckCircle2,
} from "lucide-react";
import { authService } from "../services/auth";
import { useAuth } from "../store/AuthContext";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import ConfirmModal from "../components/Common/ConfirmModal";
import { cn } from "../utils/cn";

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();

  // ─── Estados de UI ──────────────────────────────────────────────────────────
  const [showInactive, setShowInactive] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Estados para edición de rol
  const [editingUser, setEditingUser] = useState(null);
  const [newRole, setNewRole] = useState("");

  // Estado para eliminar (soft delete)
  const [deletingUser, setDeletingUser] = useState(null);

  // Estado para nuevo usuario
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "auditor",
  });
  const [createError, setCreateError] = useState("");

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ["users", showInactive],
    queryFn: () => authService.listUsers(showInactive),
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const updateRoleMut = useMutation({
    mutationFn: ({ id, role }) => authService.updateUser(id, { role }),
    onSuccess: () => {
      qc.invalidateQueries(["users"]);
      setEditingUser(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: authService.deleteUser,
    onSuccess: () => {
      qc.invalidateQueries(["users"]);
      setDeletingUser(null);
    },
  });

  const createUserMut = useMutation({
    mutationFn: authService.register,
    onSuccess: () => {
      qc.invalidateQueries(["users"]);
      setShowCreateModal(false);
      setNewUser({ email: "", full_name: "", password: "", role: "auditor" });
      setCreateError("");
    },
    onError: (err) => {
      const detail = err.response?.data?.detail;
      setCreateError(typeof detail === "string" ? detail : "Error al crear el usuario.");
    },
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleEditRole = (user) => {
    setEditingUser(user);
    setNewRole(user.role);
  };

  const handleSaveRole = () => {
    if (editingUser && newRole !== editingUser.role) {
      updateRoleMut.mutate({ id: editingUser.id, role: newRole });
    } else {
      setEditingUser(null);
    }
  };

  const handleCancelEdit = () => setEditingUser(null);

  const handleCreateUser = (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.full_name || !newUser.password) {
      setCreateError("Todos los campos son obligatorios.");
      return;
    }
    if (newUser.password.length < 6) {
      setCreateError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    createUserMut.mutate(newUser);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Gestión de Usuarios"
        subtitle="Administra los accesos al sistema"
        onRefresh={refetch}
      />

      {/* Barra de acciones */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <UserPlus size={16} /> Nuevo usuario
        </button>

        <button
          onClick={() => setShowInactive(!showInactive)}
          className={cn(
            "btn-secondary flex items-center gap-2 text-sm",
            showInactive && "bg-primary/10 text-primary border-primary/30"
          )}
        >
          {showInactive ? <Eye size={14} /> : <EyeOff size={14} />}
          {showInactive ? "Mostrar solo activos" : "Mostrar inactivos"}
        </button>
      </div>

      {/* Tabla de usuarios */}
      <GlassCard padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10">
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  ID
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  Nombre completo
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  Email
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  Rol
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  Estado
                </th>
                <th className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {users.map((user) => {
                const isCurrentUser = currentUser?.id === user.id;
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      "hover:bg-primary/3 transition-colors group animate-fade-up",
                      !user.is_active && "opacity-60 bg-ink/5"
                    )}
                  >
                    <td className="py-3 px-4 text-ink/60 font-mono text-xs">{user.id}</td>
                    <td className="py-3 px-4 font-medium text-ink">{user.full_name}</td>
                    <td className="py-3 px-4 text-ink/60">{user.email}</td>
                    <td className="py-3 px-4">
                      {editingUser?.id === user.id ? (
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          className="input-glass text-sm py-1.5"
                        >
                          <option value="admin">admin</option>
                          <option value="auditor">auditor</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "capitalize text-xs font-semibold px-2.5 py-0.5 rounded-full",
                              user.role === "admin"
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-secondary/10 text-secondary border border-secondary/20"
                            )}
                          >
                            {user.role}
                          </span>
                          {isCurrentUser && (
                            <span className="text-[10px] text-ink/30">(tú)</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "text-xs font-semibold px-2.5 py-0.5 rounded-full",
                          user.is_active
                            ? "bg-success/10 text-success border border-success/20"
                            : "bg-danger/10 text-danger border border-danger/20"
                        )}
                      >
                        {user.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {editingUser?.id === user.id ? (
                          <>
                            <button
                              onClick={handleSaveRole}
                              disabled={updateRoleMut.isPending}
                              className="btn-primary text-xs py-1.5 px-3"
                            >
                              {updateRoleMut.isPending ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                "Guardar"
                              )}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="btn-secondary text-xs py-1.5 px-3"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditRole(user)}
                              className="btn-ghost p-1.5 text-primary/60 hover:text-primary"
                              title="Editar rol"
                            >
                              <Edit size={15} />
                            </button>
                            {!isCurrentUser && user.is_active && (
                              <button
                                onClick={() => setDeletingUser(user)}
                                className="btn-ghost p-1.5 text-danger/60 hover:text-danger"
                                title="Desactivar usuario"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-ink/40">
                    No hay usuarios que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Modal de confirmación para desactivar */}
      <ConfirmModal
        open={!!deletingUser}
        title="Desactivar usuario"
        message={
          <div>
            ¿Estás seguro de que deseas desactivar a <strong>{deletingUser?.full_name}</strong>?
            <br />
            <span className="text-xs text-ink/50">
              El usuario no podrá iniciar sesión, pero sus datos permanecerán en el sistema.
            </span>
          </div>
        }
        onConfirm={() => deleteMut.mutate(deletingUser.id)}
        onCancel={() => setDeletingUser(null)}
        confirmLabel="Desactivar"
        danger={true}
      />

      {/* Modal de creación de usuario */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(6px)" }}
        >
          <div className="glass rounded-3xl p-6 w-full max-w-md shadow-2xl animate-fade-up">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <UserPlus size={16} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-ink">Crear nuevo usuario</h2>
                  <p className="text-xs text-ink/50">Todos los campos son obligatorios</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="btn-ghost p-1.5">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="field-label">Nombre completo</label>
                <input
                  type="text"
                  required
                  placeholder="Juan Pérez"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  className="input-glass text-sm"
                />
              </div>

              <div>
                <label className="field-label">Email</label>
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="input-glass text-sm"
                />
              </div>

              <div>
                <label className="field-label">Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="mínimo 6 caracteres"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="input-glass text-sm"
                />
              </div>

              <div>
                <label className="field-label">Rol</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="input-glass text-sm"
                >
                  <option value="auditor">Auditor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {createError && (
                <div className="bg-danger/10 border border-danger/20 text-danger text-xs rounded-xl px-3 py-2.5">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createUserMut.isPending}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  {createUserMut.isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Creando…</>
                  ) : (
                    <><UserPlus size={14} /> Crear usuario</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}