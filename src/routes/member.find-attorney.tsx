import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Phone, Star, Locate, CalendarCheck, Mail, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/member/find-attorney")({ component: FindAttorneyPage });

/* ---- Reference points for zip fallback (rough metro centers) ---- */
const ZIP_ANCHORS: { zip: string; city: string; state: string; lat: number; lng: number }[] = [
  { zip: "94301", city: "Palo Alto", state: "CA", lat: 37.4419, lng: -122.143 },
  { zip: "10001", city: "New York", state: "NY", lat: 40.7506, lng: -73.9971 },
  { zip: "78701", city: "Austin", state: "TX", lat: 30.2711, lng: -97.7437 },
  { zip: "02139", city: "Cambridge", state: "MA", lat: 42.3654, lng: -71.1037 },
  { zip: "98101", city: "Seattle", state: "WA", lat: 47.6106, lng: -122.3345 },
  { zip: "60601", city: "Chicago", state: "IL", lat: 41.8858, lng: -87.6181 },
  { zip: "33130", city: "Miami", state: "FL", lat: 25.7657, lng: -80.2005 },
  { zip: "80202", city: "Denver", state: "CO", lat: 39.7508, lng: -104.9964 },
];

type Attorney = {
  id: string;
  name: string;
  firm: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  specialties: string[];
  rating: number;
  reviews: number;
  nextAvail: string;
  phone: string;
  email: string;
  years: number;
  bio: string;
};

const PRACTICE_AREAS = [
  "Wills & Probate",
  "Living Trusts",
  "Elder Law",
  "Powers of Attorney",
  "Healthcare Directives",
  "Business Succession",
  "Estate Tax Planning",
];

/* ---- Mock directory scattered around each metro anchor ---- */
function scatter(base: { lat: number; lng: number }, i: number) {
  // Small deterministic offset (~1-8 mi) around anchor
  const r = 0.02 + ((i * 37) % 90) / 900;
  const a = (i * 47) % 360;
  return {
    lat: base.lat + r * Math.cos((a * Math.PI) / 180),
    lng: base.lng + r * Math.sin((a * Math.PI) / 180),
  };
}

const DIRECTORY: Attorney[] = ZIP_ANCHORS.flatMap((anchor, ai) => {
  const names = [
    { n: "Priya Shah", f: "Shah & Levine Estate Law", sp: ["Living Trusts", "Estate Tax Planning"], y: 14 },
    { n: "Marcus Whitfield", f: "Whitfield Legal", sp: ["Wills & Probate", "Powers of Attorney"], y: 22 },
    { n: "Ana García", f: "García Ruiz Attorneys", sp: ["Wills & Probate", "Healthcare Directives"], y: 11 },
    { n: "Kelly Nakamura", f: "Nakamura & Partners", sp: ["Living Trusts", "Elder Law"], y: 18 },
    { n: "Dan O'Neil", f: "O'Neil Legacy Planning", sp: ["Elder Law", "Estate Tax Planning"], y: 27 },
    { n: "Sarah Bennett", f: "Bennett Family Law", sp: ["Business Succession", "Living Trusts"], y: 9 },
  ];
  return names.map((p, i) => {
    const pos = scatter(anchor, ai * 11 + i);
    const rating = 4.5 + ((ai + i) % 5) * 0.1;
    const days = ((ai * 3 + i * 5) % 12) + 1;
    return {
      id: `${anchor.zip}-${i}`,
      name: p.n,
      firm: p.f,
      city: anchor.city,
      state: anchor.state,
      lat: pos.lat,
      lng: pos.lng,
      specialties: p.sp,
      rating: Math.round(rating * 10) / 10,
      reviews: 40 + ((ai + i) * 13) % 220,
      nextAvail: days === 1 ? "Tomorrow" : `In ${days} days`,
      phone: `(${100 + ((ai * 90 + i * 17) % 800)}) 555-0${100 + i}`,
      email: `${p.n.toLowerCase().split(" ")[0]}@${p.f.toLowerCase().split(" ")[0]}.legal`,
      years: p.y,
      bio: `${p.y}+ years of estate and trust practice serving families in ${anchor.city} and surrounding communities.`,
    };
  });
});

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function FindAttorneyPage() {
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState<number>(25);
  const [area, setArea] = useState<string>("all");
  const [showMap, setShowMap] = useState(false);
  const [locating, setLocating] = useState(false);
  const [selected, setSelected] = useState<Attorney | null>(null);

  const useGeolocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Your location" });
        setLocating(false);
        toast.success("Using your current location");
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location — enter a ZIP instead.");
      },
      { enableHighAccuracy: false, timeout: 6000 },
    );
  };

  // Auto-attempt on first mount (silently)
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Your location" }),
      () => {},
      { enableHighAccuracy: false, timeout: 4000 },
    );
  }, []);

  const applyZip = () => {
    const hit = ZIP_ANCHORS.find((z) => z.zip === zip.trim());
    if (!hit) return toast.error("Try one of: " + ZIP_ANCHORS.map((z) => z.zip).join(", "));
    setOrigin({ lat: hit.lat, lng: hit.lng, label: `${hit.city}, ${hit.state} ${hit.zip}` });
  };

  const results = useMemo(() => {
    const filtered = DIRECTORY.map((a) => ({
      ...a,
      distance: origin ? haversine(origin, a) : null,
    }))
      .filter((a) => (area === "all" ? true : a.specialties.includes(area)))
      .filter((a) => (a.distance == null ? true : a.distance <= radius))
      .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    return filtered;
  }, [origin, radius, area]);

  return (
    <AppShell
      title="Find an attorney"
      subtitle="Prefer to sit down with someone in person? Search estate-planning attorneys near you."
    >
      {/* Search controls */}
      <Card className="p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,180px,220px,auto] gap-3 items-end">
          <Button variant="secondary" onClick={useGeolocation} disabled={locating}>
            <Locate className="h-4 w-4 mr-1" /> {locating ? "Locating…" : "Use my location"}
          </Button>
          <div>
            <label className="text-xs text-muted-foreground">or ZIP</label>
            <div className="flex gap-2">
              <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g. 94301" />
              <Button variant="outline" onClick={applyZip}><MapPin className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Distance</label>
            <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 10, 25, 50, 100].map((r) => <SelectItem key={r} value={String(r)}>Within {r} miles</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Practice area</label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All estate planning</SelectItem>
                {PRACTICE_AREAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" onClick={() => setShowMap((v) => !v)}>
            <MapIcon className="h-4 w-4 mr-1" /> {showMap ? "Hide map" : "Show map"}
          </Button>
        </div>

        {origin && (
          <div className="mt-3 text-xs text-muted-foreground">
            Searching near <span className="text-foreground font-medium">{origin.label}</span> · {results.length} attorneys within {radius} mi
          </div>
        )}
        {!origin && (
          <div className="mt-3 text-xs text-muted-foreground">
            Tip: sample ZIPs include {ZIP_ANCHORS.slice(0, 4).map((z) => z.zip).join(", ")}…
          </div>
        )}
      </Card>

      {showMap && origin && <MapView origin={origin} attorneys={results} onPick={(a) => setSelected(a)} />}

      {/* Results */}
      <div className="space-y-3">
        {results.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">
            No attorneys match — widen the distance or clear the practice-area filter.
          </Card>
        )}
        {results.map((a) => (
          <Card key={a.id} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex-1 min-w-60">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-serif text-lg">{a.name}</div>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Star className="h-3 w-3 fill-primary text-primary" /> {a.rating}
                    <span className="text-muted-foreground/70">({a.reviews})</span>
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">{a.firm} · {a.city}, {a.state}</div>
                <p className="text-xs text-muted-foreground mt-2 max-w-2xl">{a.bio}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {a.specialties.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 flex-col items-end gap-3 text-right">
                {a.distance != null && (
                  <div className="text-xs text-muted-foreground inline-flex items-center justify-end gap-2">
                    <MapPin className="h-3 w-3" /> {a.distance.toFixed(1)} mi away
                  </div>
                )}
                <div className="text-xs inline-flex items-center justify-end gap-2 text-primary">
                  <CalendarCheck className="h-3 w-3" /> Next: {a.nextAvail}
                </div>
                <a href={`tel:${a.phone.replace(/[^0-9]/g, "")}`} className="inline-flex text-sm items-center justify-end gap-2">
                  <Phone className="h-3.5 w-3.5" /> {a.phone}
                </a>
                <Button size="sm" onClick={() => setSelected(a)}>
                  <CalendarCheck className="h-4 w-4 mr-2" /> Book consult
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <BookDialog attorney={selected} onClose={() => setSelected(null)} />
    </AppShell>
  );
}

function MapView({ origin, attorneys, onPick }: {
  origin: { lat: number; lng: number; label: string };
  attorneys: (Attorney & { distance: number | null })[];
  onPick: (a: Attorney) => void;
}) {
  // Compute a bounding box and scale attorney lat/lng into an SVG viewport.
  const lats = [origin.lat, ...attorneys.map((a) => a.lat)];
  const lngs = [origin.lng, ...attorneys.map((a) => a.lng)];
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = Math.max(0.02, (maxLat - minLat) * 0.15);
  const padLng = Math.max(0.02, (maxLng - minLng) * 0.15);
  const W = 800, H = 320;
  const project = (lat: number, lng: number) => {
    const x = ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * W;
    const y = H - ((lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * H;
    return { x, y };
  };

  return (
    <Card className="p-0 mb-6 overflow-hidden">
      <div className="relative bg-primary-soft/30">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-80">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.08" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />
          {attorneys.map((a) => {
            const { x, y } = project(a.lat, a.lng);
            return (
              <g key={a.id} onClick={() => onPick(a)} className="cursor-pointer">
                <circle cx={x} cy={y} r="8" fill="hsl(var(--primary))" fillOpacity="0.85" />
                <circle cx={x} cy={y} r="14" fill="hsl(var(--primary))" fillOpacity="0.15" />
              </g>
            );
          })}
          {(() => {
            const { x, y } = project(origin.lat, origin.lng);
            return (
              <g>
                <circle cx={x} cy={y} r="6" fill="hsl(var(--foreground))" />
                <circle cx={x} cy={y} r="14" fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.4" />
              </g>
            );
          })()}
        </svg>
        <div className="absolute top-3 left-3 text-xs bg-background/90 border border-border rounded-md px-2 py-1">
          Simplified map · {attorneys.length} nearby · centered on {origin.label}
        </div>
      </div>
    </Card>
  );
}

function BookDialog({ attorney, onClose }: { attorney: Attorney | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");

  useEffect(() => { if (!attorney) { setNote(""); setWhen(""); } }, [attorney]);

  const submit = () => {
    toast.success(`Consult request sent to ${attorney?.name}`);
    onClose();
  };

  return (
    <Dialog open={!!attorney} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Book a consult with {attorney?.name}</DialogTitle>
        </DialogHeader>
        {attorney && (
          <div className="space-y-3 text-sm">
            <div className="text-muted-foreground">
              {attorney.firm} · {attorney.city}, {attorney.state} · {attorney.years} yrs experience
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {attorney.phone}</div>
              <div className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {attorney.email}</div>
            </div>
            <label className="block text-xs text-muted-foreground">Preferred time</label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <label className="block text-xs text-muted-foreground">What would you like to discuss?</label>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-border rounded-md p-2 text-sm bg-background"
              placeholder="A short note about your situation…"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}><CalendarCheck className="h-4 w-4 mr-1" /> Request consult</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
