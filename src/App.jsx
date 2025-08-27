import React, { useMemo, useState } from "react";

// ---- pure calc helpers ----
function calcBaseAssemblyPsf(opts) {
  const osb = opts.includeOSB ? opts.osbPsf : 0;
  const gyp = opts.drywallLayers * opts.drywallPsf;
  return osb + gyp + opts.insulPsf;
}
function calcCloudAvgPsf(mountMode, areaFt2, totalCloudWeightLb) {
  if (mountMode === "distributed" && areaFt2 > 0) return totalCloudWeightLb / areaFt2;
  return 0;
}
function calcCombos(params) {
  const { gridPsf, allowedChannelSpacings, allowedClipSpacings, constrainToStructure, structureSpacing, clipCap } = params;
  const channels = Array.from(new Set(allowedChannelSpacings)).sort((a, b) => a - b);
  const clips = constrainToStructure ? [structureSpacing] : Array.from(new Set(allowedClipSpacings)).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    for (let j = 0; j < clips.length; j++) {
      const cl = clips[j];
      const tribAreaFt2 = (ch * cl) / 144.0;
      const loadPerClip = tribAreaFt2 * gridPsf;
      const pass = isFinite(loadPerClip) && loadPerClip <= clipCap;
      const safety = isFinite(loadPerClip) && loadPerClip > 0 ? (clipCap / loadPerClip) : Infinity;
      out.push({ channelOC: ch, clipOC: cl, tribAreaFt2, loadPerClip, pass, safety });
    }
  }
  out.sort((a, b) => (b.channelOC * b.clipOC) - (a.channelOC * a.clipOC));
  return out;
}
function firstPassing(combos) {
  for (let k = 0; k < combos.length; k++) if (combos[k].pass) return combos[k];
  return null;
}
function round2(x) { return Math.round(x * 100) / 100; }

export default function App() {
  // Assembly
  const [area, setArea] = useState(400);
  const [includeOSB, setIncludeOSB] = useState(true);
  const [osbPsf, setOsbPsf] = useState(2.7);
  const [drywallLayers, setDrywallLayers] = useState(2);
  const [drywallPsf, setDrywallPsf] = useState(2.5);
  const [insulPsf, setInsulPsf] = useState(0.2);
  const [miscPsf, setMiscPsf] = useState(0); // NEW misc distributed psf

  // Clouds
  const [mountMode, setMountMode] = useState("distributed");
  const [c4x1, setC4x1] = useState(0);
  const [c4x2, setC4x2] = useState(0);
  const [c4x3, setC4x3] = useState(0);
  const [c4x4, setC4x4] = useState(0);

  // Spacing constraints
  const [allowedChannelSpacings, setAllowedChannelSpacings] = useState([12, 16, 24]);
  const [allowedClipSpacings, setAllowedClipSpacings] = useState([24, 32, 40, 48]);
  const [constrainToStructure, setConstrainToStructure] = useState(false);
  const [structureSpacing, setStructureSpacing] = useState(48);

  const CLIP_CAP = 36;

  const totalCloudWeight = (c4x1 * 15) + (c4x2 * 30) + (c4x3 * 45) + (c4x4 * 60);
  const baseAssemblyPsf = useMemo(() =>
    calcBaseAssemblyPsf({ includeOSB, osbPsf, drywallLayers, drywallPsf, insulPsf }),
    [includeOSB, osbPsf, drywallLayers, drywallPsf, insulPsf]
  );
  const cloudAvgPsf = useMemo(() => calcCloudAvgPsf(mountMode, area, totalCloudWeight), [mountMode, area, totalCloudWeight]);
  const gridPsf = useMemo(() => baseAssemblyPsf + cloudAvgPsf + miscPsf, [baseAssemblyPsf, cloudAvgPsf, miscPsf]);

  const maxAreaPerClip = useMemo(() => (gridPsf > 0 ? (CLIP_CAP / gridPsf) : Infinity), [gridPsf]);
  const maxSpacingProduct = useMemo(() => maxAreaPerClip * 144.0, [maxAreaPerClip]);

  const combos = useMemo(() => calcCombos({
    gridPsf,
    allowedChannelSpacings,
    allowedClipSpacings,
    constrainToStructure,
    structureSpacing,
    clipCap: CLIP_CAP
  }), [gridPsf, allowedChannelSpacings, allowedClipSpacings, constrainToStructure, structureSpacing]);

  const rec = useMemo(() => firstPassing(combos), [combos]);

  const estimatedClipsOnGrid = useMemo(() => {
    if (!rec || area <= 0) return 0;
    const tribFt2 = rec.tribAreaFt2;
    return Math.ceil(area / Math.max(tribFt2, 1e-6));
  }, [rec, area]);

  const dedicatedCloudClips = useMemo(() => {
    if (mountMode !== "dedicated") return 0;
    const totalClouds = c4x1 + c4x2 + c4x3 + c4x4;
    return totalClouds * 4;
  }, [mountMode, c4x1, c4x2, c4x3, c4x4]);

  const totalClips = useMemo(() => estimatedClipsOnGrid + dedicatedCloudClips, [estimatedClipsOnGrid, dedicatedCloudClips]);

  const dedicatedRows = useMemo(() => {
    if (mountMode !== "dedicated") return [];
    const items = [
      { name: "4x1 (15 lb)", load: 15 / 4 },
      { name: "4x2 (30 lb)", load: 30 / 4 },
      { name: "4x3 (45 lb)", load: 45 / 4 },
      { name: "4x4 (60 lb)", load: 60 / 4 }
    ];
    return items.map(x => ({ name: x.name, load: x.load, pass: x.load <= CLIP_CAP, safety: x.load > 0 ? (CLIP_CAP / x.load) : Infinity }));
  }, [mountMode]);

  const Pill = ({ children, tone }) => {
    const styles = {
      success: "bg-green-100 text-green-700",
      danger: "bg-rose-100 text-rose-700",
      neutral: "bg-gray-100 text-gray-800"
    };
    const cls = styles[tone || "neutral"];
    return <span className={"inline-block rounded-full px-2 py-1 text-xs " + cls}>{children}</span>;
  };

  const NumberField = ({ label, value, setValue, min, step, suffix, title }) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-48 text-gray-600" title={title || ""}>{label}</span>
      <input
        type="number"
        className="w-36 rounded-lg border p-2"
        value={value}
        min={typeof min === "number" ? min : 0}
        step={typeof step === "number" ? step : 1}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      {suffix ? <span className="text-gray-500">{suffix}</span> : null}
    </label>
  );

  const Toggle = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-3 text-sm select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-gray-700">{label}</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">GenieClip RST Load Calculator</h1>
        <p className="text-sm text-gray-600">Compute recommended channel and clip spacing from uniform loads (36 lb/clip limit).</p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Assembly</h2>
          <div className="flex flex-col gap-3">
            <NumberField label="Ceiling area" value={area} setValue={setArea} step={1} suffix="ft^2" />
            <Toggle label="Include 23/32 OSB" checked={includeOSB} onChange={setIncludeOSB} />
            {includeOSB ? (
              <NumberField label="OSB weight" value={osbPsf} setValue={setOsbPsf} step={0.1} suffix="psf" />
            ) : null}
            <NumberField label="# of 5/8 drywall layers" value={drywallLayers} setValue={setDrywallLayers} step={1} />
            <NumberField label="Drywall weight per layer" value={drywallPsf} setValue={setDrywallPsf} step={0.1} suffix="psf" />
            <NumberField label="Insulation allowance" value={insulPsf} setValue={setInsulPsf} step={0.1} suffix="psf" />
            <div className="pt-2 border-t">
              <NumberField label="Misc distributed load" value={miscPsf} setValue={setMiscPsf} step={0.1} suffix="psf" title="Lights, Atmos speakers, cabling, etc." />
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-gray-600">Base assembly load</span><b>{round2(baseAssemblyPsf)} psf</b></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">Misc distributed load</span><b>{round2(miscPsf)} psf</b></div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Clouds</h2>
          <div className="mb-2 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="mountMode" checked={mountMode === "distributed"} onChange={() => setMountMode("distributed")} />
              <span>Distributed (adds avg psf)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mountMode" checked={mountMode === "dedicated"} onChange={() => setMountMode("dedicated")} />
              <span>Dedicated clips</span>
            </label>
          </div>
          <div className="flex flex-col gap-3">
            <NumberField label="4x1 cloud (15 lb)" value={c4x1} setValue={setC4x1} step={1} />
            <NumberField label="4x2 cloud (30 lb)" value={c4x2} setValue={setC4x2} step={1} />
            <NumberField label="4x3 cloud (45 lb)" value={c4x3} setValue={setC4x3} step={1} />
            <NumberField label="4x4 cloud (60 lb)" value={c4x4} setValue={setC4x4} step={1} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3"><span className="text-gray-600">Total cloud weight</span><div><b>{round2(totalCloudWeight)} lb</b></div></div>
            <div className="rounded-lg bg-gray-50 p-3"><span className="text-gray-600">Total grid load</span><div><b>{round2(gridPsf)} psf</b></div></div>
          </div>
          {mountMode === "dedicated" && dedicatedRows.length > 0 ? (
            <div className="mt-3">
              <h3 className="text-sm font-medium">Dedicated cloud clip check (per clip)</h3>
              <table className="w-full text-left text-sm">
                <thead className="text-gray-500"><tr><th className="py-1">Type</th><th className="py-1">Load/clip</th><th className="py-1">Status</th></tr></thead>
                <tbody>
                  {dedicatedRows.map((r, i) => (
                    <tr key={'ded-'+i} className="border-t">
                      <td className="py-1">{r.name}</td>
                      <td className="py-1">{round2(r.load)} lb</td>
                      <td className="py-1">{r.pass ? <Pill tone="success">PASS x{round2(r.safety)}</Pill> : <Pill tone="danger">FAIL</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1 text-xs text-gray-500">Assumes 4 clips per cloud.</div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Spacing options</h2>
          <div className="mb-2 text-sm text-gray-600">Calculator picks the widest spacing that still passes.</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-1 font-medium">Channel spacing (in)</div>
              <div className="flex flex-wrap gap-2">
                {[12,16,24].map((v) => (
                  <label key={'ch-'+v} className={(allowedChannelSpacings.includes(v)?"bg-gray-900 text-white":"bg-white") + " flex items-center gap-2 rounded-full border px-3 py-1"}>
                    <input type="checkbox" className="hidden" checked={allowedChannelSpacings.includes(v)} onChange={(e)=> setAllowedChannelSpacings(prev => e.target.checked ? prev.concat([v]) : prev.filter(x => x !== v))} />
                    <span>{v}"</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium">Clip spacing (in)</div>
              <div className="flex flex-wrap gap-2">
                {[24,32,40,48].map((v) => (
                  <label key={'cl-'+v} className={(!constrainToStructure && allowedClipSpacings.includes(v)?"bg-gray-900 text-white":"bg-white") + " flex items-center gap-2 rounded-full border px-3 py-1"}>
                    <input type="checkbox" className="hidden" disabled={constrainToStructure} checked={allowedClipSpacings.includes(v)} onChange={(e)=> setAllowedClipSpacings(prev => e.target.checked ? prev.concat([v]) : prev.filter(x => x !== v))} />
                    <span>{v}"</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
            <Toggle label="Clips must land on structure (no blocking)" checked={constrainToStructure} onChange={setConstrainToStructure} />
            <label className="flex items-center gap-2">
              <span className="text-gray-600">Structure spacing</span>
              <input type="number" className="w-24 rounded border p-2" value={structureSpacing} min={8} step={1} onChange={(e) => setStructureSpacing(Number(e.target.value))} />
              <span className="text-gray-500">in</span>
            </label>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3"><span className="text-gray-600">Max spacing product</span><div><b>{isFinite(maxSpacingProduct) ? Math.round(maxSpacingProduct) : "-"} in^2</b></div></div>
            <div className="rounded-lg bg-gray-50 p-3"><span className="text-gray-600">Max tributary area/clip</span><div><b>{isFinite(maxAreaPerClip) ? round2(maxAreaPerClip) : "-"} ft^2</b></div></div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Recommendation</h2>
          {rec ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
                <div>
                  <div className="text-sm text-emerald-700">Recommended spacing</div>
                  <div className="text-xl font-semibold text-emerald-900">Channels: {rec.channelOC}" OC  ·  Clips: {rec.clipOC}" OC</div>
                </div>
                <div className="text-right text-sm">
                  <div>Load/clip: <b>{round2(rec.loadPerClip)} lb</b></div>
                  <div>Safety factor: <b>x{round2(rec.safety)}</b></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="flex items-center justify-between"><span className="text-gray-600">Estimated clips on grid</span><b>{estimatedClipsOnGrid}</b></div>
                  {mountMode === "dedicated" ? (<div className="mt-1 flex items-center justify-between text-xs text-gray-600"><span>+ Cloud clips</span><b>{dedicatedCloudClips}</b></div>) : null}
                  <div className="mt-1 flex items-center justify-between"><span className="text-gray-600">Total estimated clips</span><b>{totalClips}</b></div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="flex items-center justify-between"><span className="text-gray-600">Grid load</span><b>{round2(gridPsf)} psf</b></div>
                  <div className="flex items-center justify-between"><span className="text-gray-600">Clip capacity</span><b>{CLIP_CAP} lb</b></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-rose-50 p-3 text-rose-700">No passing spacing combination with current constraints.</div>
          )}

          <div className="mt-3">
            <h3 className="mb-1 text-sm font-medium">All evaluated combos</h3>
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500"><tr><th className="py-1">Channels (OC)</th><th className="py-1">Clips (OC)</th><th className="py-1">Trib. area</th><th className="py-1">Load/clip</th><th className="py-1">Status</th></tr></thead>
              <tbody>
                {combos.map((c, i) => (
                  <tr key={'row-'+i+'-'+c.channelOC+'-'+c.clipOC} className="border-t">
                    <td className="py-1">{c.channelOC}"</td>
                    <td className="py-1">{c.clipOC}"</td>
                    <td className="py-1">{round2(c.tribAreaFt2)} ft^2</td>
                    <td className="py-1">{isFinite(c.loadPerClip) ? round2(c.loadPerClip) : "-"} lb</td>
                    <td className="py-1">{c.pass ? <Pill tone="success">PASS x{round2(c.safety)}</Pill> : <Pill tone="danger">FAIL</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-xs text-gray-500">Sorted from widest to densest; the first PASS is recommended.</div>
          </div>
        </section>
      </div>

      <footer className="mt-6 text-xs text-gray-500">Assumptions: uniform grid loads; capacity 36 lb/clip. Always verify with manufacturer data and structure.</footer>
    </div>
  );
}