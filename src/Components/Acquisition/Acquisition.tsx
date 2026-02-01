// src/Components/Acquisition.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Header from "../Header";
import Footer from "../Footer";

import {
  getDrivePreviewUrl,
  getDriveThumbUrl,
  getDriveImageUrl,
  parseFilterTagsFromSearch,
  EXT_DOWNLOAD_ORDER,
  FilterTag,
} from "./AcquisitionHelpers";

const API_BASE = "https://carcara-web-api.onrender.com";

type LinkDoc = {
  ext: string;
  link: string;
  sec: number | null;
};

type AcquisitionResponse = {
  acq_id: string;
  seconds: number[];
  links: LinkDoc[];
};

type PhotoItem = {
  ext: string;
  link: string;
  sec: number | null;
  timeLabel: string | null;
  thumbUrl: string;
  fullUrl: string;
};

type AcqIdsResponse = {
  page: number;
  per_page: number;
  has_more: boolean;
  total?: number;
  total_pages?: number;
  acq_ids: string[];
};

type Collection = {
  id: string;
  name: string;
  description?: string | null;
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function fetchCollections(token: string): Promise<Collection[]> {
  const res = await fetch(`${API_BASE}/collections`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to load collections");
  }

  const json = await res.json();
  // Backend may return either an array or a wrapped object; try to be flexible.
  if (Array.isArray(json)) {
    return json as Collection[];
  }
  if (Array.isArray(json.collections)) {
    return json.collections as Collection[];
  }
  return [];
}

async function fetchCollectionSecsForAcq(
  collectionId: string,
  acqId: string,
  token: string
): Promise<number[]> {
  const url = new URL(`${API_BASE}/collections/${collectionId}/items`);
  url.searchParams.set("acq_id", acqId);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to load collection items for acquisition");
  }

  const json = await res.json();

  // Expected shape from backend:
  // { collectionId: string, acq_id: string, secs: number[] }
  if (json && Array.isArray(json.secs)) {
    return json.secs as number[];
  }

  // Fallback: sometimes backend may return just an array of numbers
  if (Array.isArray(json)) {
    return json as number[];
  }

  return [];
}


async function addItemToCollectionApi(
  collectionId: string,
  acqId: string,
  sec: number,
  token: string
): Promise<void> {
  await fetch(`${API_BASE}/collections/${collectionId}/items/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: [{ acq_id: acqId, sec }],
    }),
  });
}

async function removeItemFromCollectionApi(
  collectionId: string,
  acqId: string,
  sec: number,
  token: string
): Promise<void> {
  await fetch(`${API_BASE}/collections/${collectionId}/items/remove`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: [{ acq_id: acqId, sec }],
    }),
  });
}

async function addItemsToCollectionApi(
  collectionId: string,
  acqId: string,
  secs: number[],
  token: string
): Promise<void> {
  if (!secs.length) return;

  await fetch(`${API_BASE}/collections/${collectionId}/items/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: secs.map((sec) => ({ acq_id: acqId, sec })),
    }),
  });
}

async function removeItemsFromCollectionApi(
  collectionId: string,
  acqId: string,
  secs: number[],
  token: string
): Promise<void> {
  if (!secs.length) return;

  await fetch(`${API_BASE}/collections/${collectionId}/items/remove`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: secs.map((sec) => ({ acq_id: acqId, sec })),
    }),
  });
}


async function createCollectionApi(
  name: string,
  description: string | null,
  token: string
): Promise<Collection | null> {
  const res = await fetch(`${API_BASE}/collections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      description: description || undefined,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create collection");
  }

  const json = await res.json();
  if (!json) return null;
  return json as Collection;
}

const Acquisition: React.FC = () => {
  const { acqId } = useParams<{ acqId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState<AcquisitionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const token = localStorage.getItem("token");
  const isLogged = !!token;

  const [mainMode, setMainMode] = useState<"video" | "photo">("video");
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);

  // lista de acq_ids que batem com os mesmos filtros (sem acq_id)
  const [acqNav, setAcqNav] = useState<AcqIdsResponse | null>(null);
  const [acqNavLoading, setAcqNavLoading] = useState(false);
  const [acqNavError, setAcqNavError] = useState("");

  // collections / items
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState("");

  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");

  const [collectionItemsLoading, setCollectionItemsLoading] = useState(false);
  const [collectionItemsError, setCollectionItemsError] = useState("");

  const [bulkUpdatingCollection, setBulkUpdatingCollection] = useState(false);

  const [selectedSecs, setSelectedSecs] = useState<Set<number>>(new Set());

  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [createCollectionError, setCreateCollectionError] = useState("");

  // fetch acquisition data
  useEffect(() => {
    if (!acqId) return;

    const fetchData = async () => {
      setLoading(true);
      setErrorMsg("");

      try {
        const search = new URLSearchParams(location.search);
        search.set("acq_id", acqId);

        const url = `${API_BASE}/api/acquisition?${search.toString()}`;

        const headers: Record<string, string> = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(url, {
          headers,
        });

        const json = await res.json();

        if (!res.ok) {
          setErrorMsg(json.error || "Error loading acquisition data.");
          setLoading(false);
          return;
        }

        setData(json);
      } catch (err) {
        setErrorMsg("Connection error. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [acqId, location.search, token]);

  // fetch acq_ids list (navigation) based on filters only
  useEffect(() => {
    const fetchAcqNav = async () => {
      setAcqNavLoading(true);
      setAcqNavError("");

      try {
        const params = new URLSearchParams(location.search);
        params.delete("acq_id");

        // evita query gigante sem filtros (match vazio no Mongo)
        const hasFilters = Array.from(params.keys()).some((k) => {
          if (k === "page" || k === "per_page") return false;
          const v = params.get(k);
          return !!v;
        });

        if (!hasFilters) {
          setAcqNav(null);
          setAcqNavLoading(false);
          return;
        }

        const url = new URL(`${API_BASE}/api/search-acq-ids`);
        params.forEach((value, key) => {
          if (value) url.searchParams.append(key, value);
        });

        const headers: Record<string, string> = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(url.toString(), {
          headers,
        });
        const json = await res.json();

        if (!res.ok) {
          setAcqNavError(json.error || "Error loading acquisitions list.");
          setAcqNav(null);
        } else {
          setAcqNav(json);
        }
      } catch (err) {
        setAcqNavError("Connection error while loading acquisitions list.");
        setAcqNav(null);
      } finally {
        setAcqNavLoading(false);
      }
    };

    fetchAcqNav();
  }, [location.search, token]);

  // fetch collections for logged user
  useEffect(() => {
    if (!isLogged) {
      setCollections([]);
      setSelectedCollectionId("");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setCollectionsLoading(true);
      setCollectionsError("");
      try {
        if (!token) return;
        const list = await fetchCollections(token);
        if (cancelled) return;
        setCollections(list);
        if (!selectedCollectionId && list.length > 0) {
          setSelectedCollectionId(list[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        setCollectionsError("Error loading your collections.");
        setCollections([]);
      } finally {
        if (!cancelled) {
          setCollectionsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isLogged, token]);

  // fetch items (secs) for selected collection + acquisition
  useEffect(() => {
    if (!isLogged || !selectedCollectionId || !acqId) {
      setSelectedSecs(new Set());
      return;
    }

    let cancelled = false;

    const run = async () => {
      setCollectionItemsLoading(true);
      setCollectionItemsError("");
      try {
        if (!token) return;
        const secs = await fetchCollectionSecsForAcq(
          selectedCollectionId,
          acqId,
          token
        );
        if (cancelled) return;
        const secsSet = new Set<number>();
        secs.forEach((sec) => {
          if (typeof sec === "number" && !Number.isNaN(sec)) {
            secsSet.add(sec);
          }
        });
        setSelectedSecs(secsSet);
      } catch (err) {
        if (cancelled) return;
        setCollectionItemsError("Error loading items for this acquisition.");
        setSelectedSecs(new Set());
      } finally {
        if (!cancelled) setCollectionItemsLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isLogged, selectedCollectionId, acqId, token]);

  const previewUrl = useMemo(() => {
    if (!data) return null;
    const avi =
      data.links.find((l) => l.ext === "avi" && l.sec == null) ||
      data.links.find((l) => l.ext === "avi");
    if (!avi) return null;
    return getDrivePreviewUrl(avi.link);
  }, [data]);

  const downloadLinks = useMemo(() => {
    if (!data) return [];
    return EXT_DOWNLOAD_ORDER.map((ext) => {
      const doc =
        data.links.find((l) => l.ext === ext && l.sec == null) ||
        data.links.find((l) => l.ext === ext);
      if (!doc) return null;
      return { ext: ext.toUpperCase(), link: doc.link };
    }).filter(Boolean) as { ext: string; link: string }[];
  }, [data]);

  const filterTags = useMemo<FilterTag[]>(
    () => parseFilterTagsFromSearch(location.search),
    [location.search]
  );

  const photos = useMemo<PhotoItem[]>(() => {
    if (!data) return [];
    const exts = new Set(["jpg", "jpeg", "png"]);
    return data.links
      .filter((l) => !!l.ext && exts.has(l.ext.toLowerCase()))
      .map((l) => {
        const thumbUrl = getDriveThumbUrl(l.link) || l.link;
        const fullUrl = getDriveImageUrl(l.link) || thumbUrl || l.link;
        return {
          ext: l.ext,
          link: l.link,
          sec: l.sec,
          timeLabel: l.sec != null ? formatTime(l.sec) : null,
          thumbUrl,
          fullUrl,
        };
      });
  }, [data]);

  const activePhoto = useMemo(() => {
    if (activePhotoIndex === null) return null;
    if (!photos[activePhotoIndex]) return null;
    return photos[activePhotoIndex];
  }, [activePhotoIndex, photos]);

  const acqList = acqNav?.acq_ids ?? [];
  const currentIndex = useMemo(() => {
    if (!acqId || !acqList.length) return -1;
    return acqList.indexOf(acqId);
  }, [acqId, acqList]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < acqList.length - 1;

  const openPhotoInMainPanel = (index: number) => {
    setActivePhotoIndex(index);
    setMainMode("photo");
  };

  const backToVideo = () => {
    setMainMode("video");
  };

  const goToPhoto = (direction: 1 | -1) => {
    if (photos.length === 0) return;
    if (activePhotoIndex === null) return;
    const total = photos.length;
    const nextIndex = (activePhotoIndex + direction + total) % total;
    setActivePhotoIndex(nextIndex);
  };

  const goToAcq = (targetId: string | null) => {
    if (!targetId) return;
    navigate(`/acquisition/${targetId}${location.search}`);
  };

  const goPrevAcq = () => {
    if (!hasPrev) return;
    const targetId = acqList[currentIndex - 1];
    goToAcq(targetId);
  };

  const goNextAcq = () => {
    if (!hasNext) return;
    const targetId = acqList[currentIndex + 1];
    goToAcq(targetId);
  };

  const goBackToView = () => {
    const params = new URLSearchParams(location.search);
    params.delete("acq_id");
    const qs = params.toString();
    navigate(`/View${qs ? `?${qs}` : ""}`);
  };

  const goToFirstPhoto = () => {
    if (photos.length === 0) return;
    setActivePhotoIndex(0);
    setMainMode("photo");
  };

  const handleCollectionChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setSelectedCollectionId(e.target.value);
  };

  const handleTogglePhotoInCollection = async (photo: PhotoItem) => {
    if (
      !isLogged ||
      !token ||
      !selectedCollectionId ||
      !acqId ||
      photo.sec == null
    ) {
      return;
    }

    const sec = photo.sec;
    const isCurrentlySelected = selectedSecs.has(sec);

    // Optimistic update
    setSelectedSecs((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        next.delete(sec);
      } else {
        next.add(sec);
      }
      return next;
    });

    try {
      if (isCurrentlySelected) {
        await removeItemFromCollectionApi(selectedCollectionId, acqId, sec, token);
      } else {
        await addItemToCollectionApi(selectedCollectionId, acqId, sec, token);
      }
    } catch (err) {
      // Revert on failure
      setSelectedSecs((prev) => {
        const next = new Set(prev);
        if (isCurrentlySelected) {
          next.add(sec);
        } else {
          next.delete(sec);
        }
        return next;
      });
    }



  };

    const handleSelectAllInCollection = async () => {
  if (
    !isLogged ||
    !token ||
    !selectedCollectionId ||
    !acqId ||
    photos.length === 0 ||
    bulkUpdatingCollection
  ) {
    return;
  }

  const ok = window.confirm(
    "Are you sure you want to add all images to this collection?"
  );
  if (!ok) return;

  const validSecs = photos
    .map((p) =>
      typeof p.sec === "number" && !Number.isNaN(p.sec) ? p.sec : null
    )
    .filter((sec): sec is number => sec !== null);

  if (validSecs.length === 0) return;

  const prevSelected = new Set(selectedSecs);
  const secsToAdd = validSecs.filter((sec) => !prevSelected.has(sec));
  if (secsToAdd.length === 0) return;

  // optimistic update
  setSelectedSecs(new Set([...prevSelected, ...secsToAdd]));
  setBulkUpdatingCollection(true);

  try {
    await addItemsToCollectionApi(selectedCollectionId, acqId, secsToAdd, token);
  } catch (err) {
    setSelectedSecs(prevSelected);
    setCollectionItemsError("Error selecting all items for this acquisition.");
  } finally {
    setBulkUpdatingCollection(false);
  }
};


 const handleClearAllInCollection = async () => {
  if (
    !isLogged ||
    !token ||
    !selectedCollectionId ||
    !acqId ||
    photos.length === 0 ||
    bulkUpdatingCollection
  ) {
    return;
  }

  const ok = window.confirm(
    "Are you sure you want to remove all images from this collection?"
  );
  if (!ok) return;

  const prevSelected = new Set(selectedSecs);
  if (prevSelected.size === 0) return;

  const validSecs = photos
    .map((p) =>
      typeof p.sec === "number" && !Number.isNaN(p.sec) ? p.sec : null
    )
    .filter((sec): sec is number => sec !== null);

  const secsToRemove = validSecs.filter((sec) => prevSelected.has(sec));
  if (secsToRemove.length === 0) return;

  // optimistic update
  const newSelected = new Set(prevSelected);
  secsToRemove.forEach((sec) => newSelected.delete(sec));
  setSelectedSecs(newSelected);
  setBulkUpdatingCollection(true);

  try {
    await removeItemsFromCollectionApi(
      selectedCollectionId,
      acqId,
      secsToRemove,
      token
    );
  } catch (err) {
    setSelectedSecs(prevSelected);
    setCollectionItemsError("Error clearing items for this acquisition.");
  } finally {
    setBulkUpdatingCollection(false);
  }
};



  const handleCreateCollection = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    if (!isLogged || !token) return;
    const trimmed = newCollectionName.trim();
    if (!trimmed) {
      setCreateCollectionError("Collection name is required.");
      return;
    }
    setCreateCollectionError("");

    try {
      const created = await createCollectionApi(
        trimmed,
        newCollectionDescription.trim() || null,
        token
      );
      if (created) {
        setCollections((prev) => [...prev, created]);
        setSelectedCollectionId(created.id);
      }
      setCreatingCollection(false);
      setNewCollectionName("");
      setNewCollectionDescription("");
    } catch (err) {
      setCreateCollectionError("Error creating collection.");
    }
  };

  return (
    <div className="bg-zinc-950 min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col mt-5">
        {errorMsg && (
          <div className="mx-3 mb-2 bg-red-900 text-red-100 text-sm px-3 py-2 rounded border border-red-700">
            {errorMsg}
          </div>
        )}
        {acqNavError && (
          <div className="mx-3 mb-2 bg-red-900 text-red-100 text-xs px-3 py-1 rounded border border-red-700">
            {acqNavError}
          </div>
        )}

        <div className="flex justify-center px-2 sm:px-3 pb-6">
          <main className="w-full max-w-7xl grid gap-4 lg:grid-cols-3 items-start">
            <section className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3 sm:p-4 flex flex-col gap-4">
              <div className="w-full">
                {/* NAV / CONTROLS */}
                <div className="flex flex-col gap-1 mb-2">
                  <div className="mt-1 flex items-start justify-between text-[11px] sm:text-xs text-gray-200 gap-2">
                    {/* Left column: Back to View + Previous */}
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={goBackToView}
                        className="inline-flex items-center text-[11px] sm:text-xs px-2 py-1 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-gray-200"
                      >
                        ← Back to View
                      </button>

                      {acqList.length > 0 && currentIndex >= 0 && (
                        <button
                          type="button"
                          onClick={goPrevAcq}
                          disabled={!hasPrev}
                          className={`w-28 px-3 py-1 rounded-full border ${
                            hasPrev
                              ? "border-gray-500 bg-zinc-800 hover:bg-zinc-700 text-gray-100 cursor-pointer"
                              : "border-zinc-800 bg-zinc-900 text-zinc-500 cursor-not-allowed"
                          }`}
                        >
                          ← Previous
                        </button>
                      )}
                    </div>

                    {/* Middle: acquisition counter */}
                    {acqList.length > 0 && currentIndex >= 0 && (
                      <div className="flex-1 text-center mt-4 sm:mt-3">
                        <span>
                          Acquisition {currentIndex + 1} of{" "}
                          {acqNav?.total ?? acqList.length}
                        </span>
                      </div>
                    )}

                    {/* Right column: Go to photos / Back to video + Next */}
                    <div className="flex flex-col gap-1 items-end">
                      {acqList.length > 0 && currentIndex >= 0 && (
                        <>
                          {mainMode === "photo" ? (
                            <button
                              type="button"
                              onClick={backToVideo}
                              className="px-3 py-1 rounded-full border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-gray-100"
                            >
                              Video Panel
                            </button>
                          ) : photos.length > 0 ? (
                            <button
                              type="button"
                              onClick={goToFirstPhoto}
                              className="px-3 py-1 rounded-full border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-gray-100"
                            >
                              Go to photos
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={goNextAcq}
                            disabled={!hasNext}
                            className={`w-28 px-3 py-1 rounded-full border ${
                              hasNext
                                ? "border-gray-500 bg-zinc-800 hover:bg-zinc-700 text-gray-100 cursor-pointer"
                                : "border-zinc-800 bg-zinc-900 text-zinc-500 cursor-not-allowed"
                            }`}
                          >
                            Next →
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {acqNavLoading && (
                    <p className="text-xs text-gray-400">
                      Loading acquisition list...
                    </p>
                  )}
                </div>

                {/* MAIN PANEL: VIDEO / PHOTO */}
                <div className="relative w-full rounded overflow-hidden bg-black aspect-video min-h-[180px] xs:min-h-[200px] sm:min-h-[220px] md:min-h-[260px] lg:min-h-[300px]">
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-gray-300 text-sm sm:text-base">
                        Loading...
                      </p>
                    </div>
                  ) : mainMode === "photo" && activePhoto ? (
                    <>
                      <img
                        src={activePhoto.fullUrl}
                        alt={activePhoto.timeLabel || "Photo"}
                        className="absolute inset-0 w-full h-full object-contain bg-black"
                      />
                      {isLogged && selectedCollectionId && activePhoto.sec != null && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePhotoInCollection(activePhoto);
                          }}
                          className="absolute left-2 bottom-2 bg-zinc-900/80 hover:bg-zinc-800/90 text-[11px] sm:text-xs px-3 py-1 rounded-full border border-teal-500 text-teal-100"
                        >
                          {selectedSecs.has(activePhoto.sec) ? "✓ Remove from collection" : "+ Add to collection"}
                        </button>
                      )}
                      {photos.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => goToPhoto(-1)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-zinc-900/70 hover:bg-zinc-800/90 text-gray-100 text-xl sm:text-2xl px-2 py-1 rounded-full border border-zinc-700"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={() => goToPhoto(1)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-zinc-900/70 hover:bg-zinc-800/90 text-gray-100 text-xl sm:text-2xl px-2 py-1 rounded-full border border-zinc-700"
                          >
                            ›
                          </button>
                          <div className="absolute bottom-2 right-2 bg-zinc-900/80 text-gray-100 text-xs sm:text-sm px-2 py-1 rounded-full border border-zinc-700">
                            {activePhotoIndex !== null &&
                              `${activePhotoIndex + 1} / ${photos.length}`}
                          </div>
                        </>
                      )}
                    </>
                  ) : previewUrl ? (
                    <iframe
                      className="absolute inset-0 w-full h-full"
                      src={previewUrl}
                      allow="fullscreen"
                      allowFullScreen
                      title={`Acquisition ${acqId} video`}
                    ></iframe>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-gray-300 p-4 text-sm sm:text-base">
                        No AVI video found for this acquisition.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full flex flex-col md:flex-row gap-3 md:gap-4">
                <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-3">
                  <h3 className="text-base sm:text-lg text-yellow-200 mb-2">
                    Active Filters
                  </h3>
                  {filterTags.length === 0 ? (
                    <p className="text-gray-400 text-xs sm:text-sm">
                      No filters applied.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {filterTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="bg-zinc-800 text-gray-100 text-[11px] sm:text-xs px-2 py-1 rounded-full border border-zinc-700"
                        >
                          {tag.label}
                          {tag.value && (
                            <>
                              <span className="font-semibold">: </span>
                              {tag.value}
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-3">
                  <h3 className="text-base sm:text-lg text-yellow-200 mb-2">
                    Downloads
                  </h3>
                  {downloadLinks.length === 0 ? (
                    <p className="text-gray-400 text-xs sm:text-sm">
                      No download files found (AVI / CSV / MF4 / BLF).
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {downloadLinks.map((d) => (
                        <a
                          key={d.ext}
                          href={d.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-teal-900 hover:bg-teal-800 text-teal-100 text-[11px] sm:text-xs px-3 py-1 rounded-full border border-teal-700 font-semibold"
                        >
                          {d.ext}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-lg p-3 sm:p-4 flex flex-col">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <h2 className="text-lg sm:text-xl text-yellow-200">
                  Highlights{photos.length > 0 ? ` (${photos.length})` : ""}
                </h2>
                {photos.length > 0 && activePhotoIndex !== null && (
                  <span className="text-[11px] sm:text-xs text-gray-300">
                    Viewing {activePhotoIndex + 1} / {photos.length}
                  </span>
                )}
              </div>

              {loading ? (
                <p className="text-gray-300 text-sm">Loading highlights...</p>
              ) : photos.length === 0 ? (
                <>
                  {!isLogged && (
                    <p className="text-gray-400 text-[11px] sm:text-xs mb-1">
                      Log in to manage your own collections and save favorite acquisitions.
                    </p>
                  )}
                  <p className="text-gray-300 text-sm">
                    No highlights found for this acquisition.
                  </p>
                </>
              ) : (
                <>
                  {/* Collections controls */}
                  {isLogged ? (
                    <div className="mb-3 space-y-2">
                      {collectionsLoading ? (
                        <p className="text-[11px] sm:text-xs text-gray-300">
                          Loading your collections...
                        </p>
                      ) : collections.length === 0 ? (
                        <div className="border border-zinc-700 rounded p-2 bg-zinc-950">
                          <p className="text-[11px] sm:text-xs text-gray-200 mb-2">
                            You don't have any collections yet. Create one to start
                            saving your favorite frames from this acquisition.
                          </p>
                          {!creatingCollection ? (
                            <button
                              type="button"
                              onClick={() => setCreatingCollection(true)}
                              className="text-[11px] sm:text-xs px-3 py-1 rounded-full border border-teal-600 bg-teal-900 hover:bg-teal-800 text-teal-100"
                            >
                              Create first collection
                            </button>
                          ) : (
                            <form
                              onSubmit={handleCreateCollection}
                              className="flex flex-col gap-2 mt-1"
                            >
                              <input
                                type="text"
                                placeholder="Collection name"
                                value={newCollectionName}
                                onChange={(e) =>
                                  setNewCollectionName(e.target.value)
                                }
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] sm:text-xs text-gray-100"
                              />
                              <input
                                type="text"
                                placeholder="Description (optional)"
                                value={newCollectionDescription}
                                onChange={(e) =>
                                  setNewCollectionDescription(e.target.value)
                                }
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] sm:text-xs text-gray-100"
                              />
                              {createCollectionError && (
                                <p className="text-[11px] text-red-300">
                                  {createCollectionError}
                                </p>
                              )}
                              <div className="flex gap-2 mt-1">
                                <button
                                  type="submit"
                                  className="text-[11px] sm:text-xs px-3 py-1 rounded-full border border-teal-600 bg-teal-900 hover:bg-teal-800 text-teal-100"
                                >
                                  Save collection
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCreatingCollection(false);
                                    setNewCollectionName("");
                                    setNewCollectionDescription("");
                                    setCreateCollectionError("");
                                  }}
                                  className="text-[11px] sm:text-xs px-3 py-1 rounded-full border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-gray-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] sm:text-xs text-gray-200">
                              Collection:
                            </label>
                            <select
                              value={selectedCollectionId}
                              onChange={handleCollectionChange}
                              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-[11px] sm:text-xs text-gray-100"
                            >
                              {collections.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setCreatingCollection((prev) => !prev);
                                setCreateCollectionError("");
                              }}
                              className="text-[11px] sm:text-xs px-2 py-1 rounded-full border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-gray-100"
                            >
                              + New
                            </button>
                          </div>
                          {creatingCollection && (
                            <form
                              onSubmit={handleCreateCollection}
                              className="flex flex-col gap-2 mt-1"
                            >
                              <input
                                type="text"
                                placeholder="Collection name"
                                value={newCollectionName}
                                onChange={(e) =>
                                  setNewCollectionName(e.target.value)
                                }
                                className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-[11px] sm:text-xs text-gray-100"
                              />
                              <input
                                type="text"
                                placeholder="Description (optional)"
                                value={newCollectionDescription}
                                onChange={(e) =>
                                  setNewCollectionDescription(e.target.value)
                                }
                                className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-[11px] sm:text-xs text-gray-100"
                              />
                              {createCollectionError && (
                                <p className="text-[11px] text-red-300">
                                  {createCollectionError}
                                </p>
                              )}
                              <div className="flex gap-2 mt-1">
                                <button
                                  type="submit"
                                  className="text-[11px] sm:text-xs px-3 py-1 rounded-full border border-teal-600 bg-teal-900 hover:bg-teal-800 text-teal-100"
                                >
                                  Save collection
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCreatingCollection(false);
                                    setNewCollectionName("");
                                    setNewCollectionDescription("");
                                    setCreateCollectionError("");
                                  }}
                                  className="text-[11px] sm:text-xs px-3 py-1 rounded-full border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-gray-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          )}
                          {collectionItemsLoading && (
                            <p className="text-[11px] sm:text-xs text-gray-400">
                              Syncing items for this acquisition...
                            </p>
                          )}
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <p className="text-[10px] sm:text-[11px] text-gray-400">
                              Click a thumbnail to open it. Use ✓ to add or remove it from your collection.
                            </p>
                            {!isLogged ? (
                              <div className="text-xs text-gray-400 italic px-2 py-1">
                                Log in to create personalized photo collections.
                              </div>
                            ) : (
                              selectedCollectionId &&
                              photos.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={handleSelectAllInCollection}
                                    disabled={bulkUpdatingCollection || collectionItemsLoading}
                                    className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full border border-teal-500 text-teal-100 bg-zinc-900 hover:bg-zinc-800"
                                  >
                                    Select all
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleClearAllInCollection}
                                    disabled={bulkUpdatingCollection || collectionItemsLoading}
                                    className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full border border-zinc-600 text-gray-100 bg-zinc-900 hover:bg-zinc-800"
                                  >
                                    Clear all
                                  </button>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                      {collectionsError && (
                        <p className="text-[11px] sm:text-xs text-red-300">
                          {collectionsError}
                        </p>
                      )}
                      {collectionItemsError && (
                        <p className="text-[11px] sm:text-xs text-red-300">
                          {collectionItemsError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-[11px] sm:text-xs mb-2">
                      Log in to manage your own collections and save favorite frames
                      from this acquisition.
                    </p>
                  )}

                  <div className="border border-zinc-800 rounded p-2 bg-zinc-950 overflow-y-auto max-h-[28rem] xs:max-h-[32rem] sm:max-h-[26rem] md:max-h-[26rem] lg:max-h-[30rem] w-full">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {photos.map((photo, idx) => {
                        const isActive =
                          mainMode === "photo" && activePhotoIndex === idx;
                        const sec =
                          typeof photo.sec === "number" ? photo.sec : null;
                        const isInCollection =
                          sec !== null && selectedSecs.has(sec);

                        return (
                          <div
                            key={`${photo.link}-${idx}`}
                            className="group flex flex-col items-center gap-1 cursor-pointer"
                            onClick={() => openPhotoInMainPanel(idx)}
                          >
                            <div
                              className={`relative w-full aspect-video overflow-hidden rounded border  ${
                                isActive
                                  ? "border-yellow-400 ring-2 ring-yellow-400/70"
                                  : "border-zinc-800"
                              } bg-black`}
                            >
                              <img
                                src={photo.thumbUrl}
                                alt={photo.timeLabel || "Frame"}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                loading="lazy"
                              />
                              {isLogged &&
                                selectedCollectionId &&
                                sec !== null && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTogglePhotoInCollection(photo);
                                    }}
                                    className={`absolute top-1 right-1 text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-full border ${
                                      isInCollection
                                        ? "bg-teal-500 border-teal-400 text-black"
                                        : "bg-zinc-900/80 border-zinc-600 text-gray-100 hover:bg-zinc-800"
                                    }`}
                                  >
                                    {isInCollection ? "✓" : "+"}
                                  </button>
                                )}
                            </div>
                            {photo.sec != null && (
                              <span className="text-[10px] sm:text-[11px] text-gray-300">
                                {formatTime(photo.sec)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </section>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Acquisition;
