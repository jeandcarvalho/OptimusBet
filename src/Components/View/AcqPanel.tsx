// src/Components/AcqPanel.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Group,
  thumbUrl,
  previewUrl,
  fullImageUrl,
  uniqueBySecond,
  limitPhotosUniform,
  formatAcqIdLabel,
  formatSecLabel,
} from "./viewHelpers";

type AcqPanelProps = { group: Group; onOpen: () => void };

const AcqPanel: React.FC<AcqPanelProps> = ({ group, onOpen }) => {
  const totalSecondsForAcq = useMemo(
    () => new Set(group.photos.map((p) => p.sec ?? -1)).size,
    [group.photos],
  );

  const photosForUi = useMemo(() => {
    const sorted = [...group.photos].sort((a, b) => (a.sec ?? 0) - (b.sec ?? 0));
    const uniq = uniqueBySecond(sorted);
    return limitPhotosUniform(uniq);
  }, [group.photos]);

  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    setIdx(0);
    setStage(0);
  }, [group.acq_id]);

  const photo = photosForUi[idx];

  const candidates = useMemo(() => {
    const raw = photo.link;
    const thumb = thumbUrl(raw);
    const preview = previewUrl(raw);
    const full = fullImageUrl(raw);
    return [thumb, preview, full, raw];
  }, [photo.link]);

  useEffect(() => {
    setStage(0);
  }, [idx]);

  const src = candidates[Math.min(stage, candidates.length - 1)];
  const acqLabel = formatAcqIdLabel(group.acq_id);

  // contador do canto direito: x/5+ quando há 5 imagens (ou mais segundos)
  const shownCount = photosForUi.length;
  const denomLabel =
    shownCount === 5
      ? `${shownCount}+`
      : totalSecondsForAcq > shownCount
      ? `${shownCount}+`
      : `${shownCount}`;
  const currentLabel = `${idx + 1}/${denomLabel}`;

  const secLabel = formatSecLabel(photo.sec);

  return (
    <section
      className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden text-base hover:border-yellow-500/60 hover:bg-zinc-900/90 cursor-pointer transition-colors"
      onClick={onOpen}
    >
      <div className="px-4 py-3 flex items-center justify-between bg-zinc-900/70 border-b border-zinc-800">
        <div className="text-base">
          <div className="font-semibold text-zinc-100">{acqLabel}</div>
        </div>
        <div className="text-sm text-yellow-400 font-semibold">{currentLabel}</div>
      </div>

      <div className="relative">
        <img
          key={`${group.acq_id}-${photo.sec}-${idx}-${stage}`}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full aspect-[16/9] object-cover bg-zinc-800"
          onError={() =>
            setStage((s) => (s + 1 < candidates.length ? s + 1 : s))
          }
        />

        {photosForUi.length > 1 && (
          <>
            <button
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 px-3 py-2 rounded-full text-xl font-bold shadow-lg border border-zinc-600"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((idx - 1 + photosForUi.length) % photosForUi.length);
              }}
            >
              ‹
            </button>

            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 px-3 py-2 rounded-full text-xl font-bold shadow-lg border border-zinc-600"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((idx + 1) % photosForUi.length);
              }}
            >
              ›
            </button>
          </>
        )}

        {photosForUi.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
            {photosForUi.map((_, i) => {
              const active = i === idx;
              return (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-full border ${
                    active
                      ? "bg-yellow-400 border-yellow-400"
                      : "border-yellow-400/60 bg-black/60"
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-3 text-sm text-zinc-300 flex items-center justify-between border-t border-zinc-800">
        <span>sec: {secLabel}</span>
        <a
          href={photo.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="underline font-medium"
        >
          open original
        </a>
      </div>
    </section>
  );
};

export default AcqPanel;
