import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CatIcon } from "@/components/site/icons";
import { supabase } from "@/integrations/supabase/client";
import { adminCategories, swapOrder, type CategoryRow } from "@/lib/admin/api";
import { friendlyError } from "@/lib/admin/errors";
import { asIcon, CATEGORY_ICONS } from "@/lib/catalog/types";

export const Route = createFileRoute("/admin/_painel/categorias")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminCategories),
  head: () => ({
    meta: [
      { title: "Categorias — Painel Garimou Achou!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Categories,
});

const ICON_NAMES: Record<string, string> = {
  home: "Casa",
  cpu: "Tecnologia",
  shirt: "Roupa",
  sparkles: "Beleza",
  box: "Caixa",
  gift: "Presente",
  grid: "Grade",
};

function Categories() {
  const { data } = useSuspenseQuery(adminCategories);
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
  };
  const move = async (i: number, d: -1 | 1) => {
    const a = data[i],
      b = data[i + d];
    if (!a || !b) return;
    try {
      await swapOrder("categories", a, b);
      refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <>
      <h1 className="mb-4 text-2xl font-extrabold text-navy">Categorias</h1>
      <ul className="space-y-2">
        {data.map((c, i) => (
          <Row
            key={c.id}
            c={c}
            first={i === 0}
            last={i === data.length - 1}
            onMove={(d) => move(i, d)}
            onSaved={refresh}
          />
        ))}
      </ul>
    </>
  );
}

function Row({
  c,
  first,
  last,
  onMove,
  onSaved,
}: {
  c: CategoryRow;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(c.name);
  const [icon, setIcon] = useState(c.icon);
  const [busy, setBusy] = useState(false);
  const upd = async (patch: Partial<CategoryRow>, msg: string) => {
    setBusy(true);
    const { error } = await supabase.from("categories").update(patch).eq("id", c.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(msg);
    onSaved();
  };
  const dirty = name.trim() !== c.name || icon !== c.icon;
  return (
    <li
      className={`flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 ${c.is_active ? "" : "opacity-60"}`}
    >
      <div className="flex flex-col">
        <button
          aria-label={`Subir ${c.name}`}
          disabled={first}
          onClick={() => onMove(-1)}
          className="disabled:opacity-30"
        >
          <ArrowUp className="size-4" />
        </button>
        <button
          aria-label={`Descer ${c.name}`}
          disabled={last}
          onClick={() => onMove(1)}
          className="disabled:opacity-30"
        >
          <ArrowDown className="size-4" />
        </button>
      </div>
      <span className="grid size-9 place-items-center rounded-full bg-accent text-navy">
        <CatIcon icon={asIcon(icon)} className="size-5" />
      </span>
      <Input
        aria-label="Nome da categoria"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        className="h-9 w-48"
      />
      <select
        aria-label="Ícone"
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {CATEGORY_ICONS.map((k) => (
          <option key={k} value={k}>
            {ICON_NAMES[k]}
          </option>
        ))}
      </select>
      {dirty && (
        <Button
          size="sm"
          disabled={busy || !name.trim()}
          onClick={() => upd({ name: name.trim(), icon }, "Categoria salva.")}
        >
          Salvar
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="ml-auto"
        disabled={busy}
        onClick={() =>
          upd(
            { is_active: !c.is_active },
            c.is_active ? "Categoria desativada." : "Categoria ativada.",
          )
        }
      >
        {c.is_active ? "Desativar" : "Ativar"}
      </Button>
    </li>
  );
}
