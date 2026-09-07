"use client";

import * as React from "react";
import useSWR from "swr";
import { fetcher } from "@/components/dashboard/shell";
import { Card, CardHeader, CardTitle, CardBody, Button, Input, Field, Skeleton, useToast } from "@/components/ui";
import type { Plan } from "../types";

const FIELDS: { key: keyof Plan; label: string }[] = [
  { key: "name", label: "Nom" },
  { key: "price_dzd", label: "Prix (DA / mois)" },
  { key: "max_orders_month", label: "Commandes / mois" },
  { key: "max_messages_month", label: "Messages / mois" },
  { key: "max_team_members", label: "Membres d'équipe" },
  { key: "max_delivery_connections", label: "Connexions transporteur" },
  { key: "max_automations", label: "Automatisations" },
];

export default function PlansPage() {
  const { data, isLoading, mutate } = useSWR<{ rows: Plan[] }>("/api/admin/plans", fetcher);
  const { push } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  if (isLoading || !data) return <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-[14px]" />)}</div>;

  return (
    <div className="space-y-3">
      <Card className="p-3.5">
        <p className="text-[12.5px] text-ink-600">
          Les plans définissent les limites d&apos;usage appliquées côté serveur. L&apos;activation reste manuelle : l&apos;architecture de facturation est indépendante
          de tout prestataire de paiement, ce qui permet d&apos;en brancher un plus tard sans refonte.
        </p>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        {data.rows.map((p) => (
          <Card key={p.code}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <span className="text-[11.5px] uppercase text-ink-400">{p.code}</span>
            </CardHeader>
            <CardBody>
              <form
                className="space-y-2.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  setBusy(p.code);
                  const res = await fetch("/api/admin/plans", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      code: p.code,
                      name: fd.get("name"),
                      priceDzd: Number(fd.get("price_dzd")),
                      maxOrdersMonth: Number(fd.get("max_orders_month")),
                      maxMessagesMonth: Number(fd.get("max_messages_month")),
                      maxTeamMembers: Number(fd.get("max_team_members")),
                      maxDeliveryConnections: Number(fd.get("max_delivery_connections")),
                      maxAutomations: Number(fd.get("max_automations")),
                    }),
                  });
                  setBusy(null);
                  if (!res.ok) return push({ variant: "error", title: "Erreur" });
                  push({ variant: "success", title: "Plan mis à jour" });
                  mutate();
                }}
              >
                {FIELDS.map((f) => (
                  <Field key={String(f.key)} label={f.label}>
                    <Input
                      name={String(f.key)}
                      className="h-8 text-[12.5px]"
                      type={f.key === "name" ? "text" : "number"}
                      defaultValue={String(p[f.key] ?? "")}
                      required
                    />
                  </Field>
                ))}
                <Button type="submit" variant="primary" size="sm" loading={busy === p.code}>Enregistrer</Button>
              </form>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
