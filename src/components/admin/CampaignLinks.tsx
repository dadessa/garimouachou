import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAMPAIGN_CHANNELS, campaignUrl } from "@/lib/analytics/campaign";

/** Gera links de divulgação do produto, identificados por UTM, para copiar. */
export function CampaignLinks({ slug }: { slug: string }) {
  const [channel, setChannel] = useState<string>("instagram");
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const preset = CAMPAIGN_CHANNELS.find((c) => c.id === channel);
  const url = campaignUrl(slug, {
    source: preset?.source ?? source,
    medium: preset?.medium ?? "campanha",
    campaign,
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  };
  return (
    <section className="mt-8 space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-extrabold text-navy">Links de divulgação</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Canal">
        {[...CAMPAIGN_CHANNELS, { id: "outro", label: "Personalizada" }].map((c) => (
          <Button
            key={c.id}
            type="button"
            size="sm"
            variant={channel === c.id ? "default" : "outline"}
            aria-pressed={channel === c.id}
            onClick={() => setChannel(c.id)}
          >
            {c.label}
          </Button>
        ))}
      </div>
      {!preset && (
        <div className="space-y-1">
          <Label htmlFor="utm-source">Origem (ex.: newsletter, youtube)</Label>
          <Input
            id="utm-source"
            value={source}
            maxLength={60}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="utm-campaign">Nome da campanha (opcional)</Label>
        <Input
          id="utm-campaign"
          value={campaign}
          maxLength={60}
          placeholder="ex.: achadinhos-da-semana"
          onChange={(e) => setCampaign(e.target.value)}
        />
      </div>
      <Input readOnly value={url} aria-label="Link gerado" onFocus={(e) => e.target.select()} />
      <Button type="button" size="sm" onClick={copy}>
        Copiar link
      </Button>
      <p className="text-xs text-muted-foreground">
        O link leva à página do produto no site. O link de afiliado não é alterado.
      </p>
    </section>
  );
}
