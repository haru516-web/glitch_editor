import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultRect = { x: 0.2, y: 0.2, w: 0.45, h: 0.3 };
const emptyRect = { x: 0, y: 0, w: 0, h: 0 };

function createLayer(rect = emptyRect, name = "Layer") {
  return {
    id: uid(),
    name,
    enabled: false,
    hasSelection: rect.w > 0 && rect.h > 0,
    opacity: 82,
    sliceCount: 18,
    maxSliceHeight: 22,
    horizontalJitter: 34,
    rgbShift: 10,
    lineNoise: 18,
    blockNoise: 10,
    scanlines: 28,
    tintColor: "#00e5ff",
    tintStrength: 55,
    lineColor: "#ffffff",
    scanlineColor: "#000000",
    seed: Math.floor(Math.random() * 1000000),
    rect: { ...rect },
  };
}

function drawChecker(ctx, width, height, size = 20) {
  ctx.save();
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle =
        (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0 ? "#13151c" : "#171a22";
      ctx.fillRect(x, y, size, size);
    }
  }
  ctx.restore();
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const safe = /^#?[0-9a-fA-F]{3,6}$/.test(hex) ? hex : "#ffffff";
  const clean = safe.replace("#", "").trim();
  const normalized =
    clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  const int = Number.parseInt(normalized.slice(0, 6), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbaFromHex(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyGlitchRegion(ctx, img, layer, imgW, imgH) {
  const { rect } = layer;
  if (!layer.enabled || !layer.hasSelection || rect.w <= 0 || rect.h <= 0) return;

  const rx = Math.round(rect.x * imgW);
  const ry = Math.round(rect.y * imgH);
  const rw = Math.max(8, Math.round(rect.w * imgW));
  const rh = Math.max(8, Math.round(rect.h * imgH));

  const random = mulberry32(layer.seed);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = rw;
  tempCanvas.height = rh;
  const tctx = tempCanvas.getContext("2d", { willReadFrequently: true });
  if (!tctx) return;

  tctx.clearRect(0, 0, rw, rh);
  tctx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);

  const sliceCanvas = document.createElement("canvas");
  sliceCanvas.width = rw;
  sliceCanvas.height = rh;
  const sctx = sliceCanvas.getContext("2d");
  if (!sctx) return;

  const sliceCount = Math.max(1, layer.sliceCount);
  sctx.drawImage(tempCanvas, 0, 0);
  for (let i = 0; i < sliceCount; i++) {
    const sh = Math.max(2, Math.round(random() * layer.maxSliceHeight) + 2);
    const sy = Math.round(random() * Math.max(1, rh - sh));
    const jitter = (random() * 2 - 1) * layer.horizontalJitter;
    sctx.drawImage(tempCanvas, 0, sy, rw, sh, jitter, sy, rw, sh);
  }

  tctx.clearRect(0, 0, rw, rh);
  tctx.globalCompositeOperation = "source-over";
  tctx.globalAlpha = 1;

  const shift = layer.rgbShift;
  tctx.save();
  tctx.drawImage(sliceCanvas, 0, 0);
  tctx.globalCompositeOperation = "screen";
  tctx.globalAlpha = 0.45;
  tctx.drawImage(sliceCanvas, shift, 0);
  tctx.drawImage(sliceCanvas, -shift, 0);
  tctx.restore();

  tctx.save();
  const tintStrength = clamp(layer.tintStrength / 100, 0, 1);
  if (tintStrength > 0) {
    tctx.globalCompositeOperation = "screen";
    tctx.globalAlpha = 0.12 + tintStrength * 0.35;
    tctx.fillStyle = layer.tintColor;
    tctx.fillRect(0, 0, rw, rh);

    tctx.globalCompositeOperation = "overlay";
    tctx.globalAlpha = 0.1 + tintStrength * 0.25;
    tctx.fillStyle = layer.tintColor;
    tctx.fillRect(0, 0, rw, rh);
  }
  tctx.restore();

  tctx.save();
  tctx.globalAlpha = 0.2 + layer.blockNoise / 180;
  for (let i = 0; i < layer.blockNoise * 2; i++) {
    const bw = Math.round(8 + random() * Math.max(10, rw * 0.18));
    const bh = Math.round(4 + random() * Math.max(8, rh * 0.12));
    const bx = Math.round(random() * Math.max(1, rw - bw));
    const by = Math.round(random() * Math.max(1, rh - bh));
    const jx = (random() * 2 - 1) * layer.horizontalJitter * 0.9;
    tctx.drawImage(sliceCanvas, bx, by, bw, bh, bx + jx, by, bw, bh);
  }
  tctx.restore();

  tctx.save();
  for (let i = 0; i < layer.lineNoise * 3; i++) {
    const y = Math.round(random() * rh);
    const h = Math.max(1, Math.round(random() * 3));
    tctx.fillStyle = rgbaFromHex(layer.lineColor, 0.04 + random() * 0.18);
    tctx.fillRect(0, y, rw, h);
  }

  const scanGap = clamp(14 - Math.floor(layer.scanlines / 8), 2, 14);
  for (let y = 0; y < rh; y += scanGap) {
    tctx.fillStyle = rgbaFromHex(layer.scanlineColor, 0.04 + layer.scanlines / 500);
    tctx.fillRect(0, y, rw, 1);
  }
  tctx.restore();

  ctx.save();
  ctx.globalAlpha = clamp(layer.opacity / 100, 0, 1);
  ctx.drawImage(tctx.canvas, rx, ry, rw, rh);
  ctx.restore();
}

function SliderField({ label, value, min, max, step, onChange }) {
  return (
    <label className="control-card">
      <div className="control-head">
        <span>{label}</span>
        <span className="value">{value}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step="0.01"
        min="0"
        max="1"
        value={Number(value).toFixed(2)}
        onChange={(e) => onChange(Number(e.target.value || 0))}
      />
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="color-card">
      <span>{label}</span>
      <div className="color-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </label>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);
  const imageRef = useRef(null);

  const [imageSrc, setImageSrc] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [layers, setLayers] = useState([createLayer(emptyRect, "Layer 1")]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectionMode, setSelectionMode] = useState("create");

  useEffect(() => {
    if (!selectedLayerId && layers.length > 0) {
      setSelectedLayerId(layers[0].id);
    }
  }, [layers, selectedLayerId]);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) ?? layers[0] ?? null,
    [layers, selectedLayerId]
  );

  const renderCanvas = useCallback(
    (options = {}) => {
      const { includeSelection = true, targetCanvas = null } = options;
      const canvas = targetCanvas ?? canvasRef.current;
      const img = imageRef.current;
      if (!canvas || !img) return;

      const maxWidth = targetCanvas ? img.naturalWidth : 980;
      const maxHeight = targetCanvas ? img.naturalHeight : 620;
      const scale = targetCanvas
        ? 1
        : Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);

      const width = Math.round(img.naturalWidth * scale);
      const height = Math.round(img.naturalHeight * scale);

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      drawChecker(ctx, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      layers.forEach((layer) => {
        if (layer.enabled && layer.hasSelection) {
          applyGlitchRegion(ctx, img, layer, width, height);
        }
      });

      if (includeSelection && selectedLayer?.hasSelection) {
        const { x, y, w, h } = selectedLayer.rect;
        const rx = x * width;
        const ry = y * height;
        const rw = w * width;
        const rh = h * height;

        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.restore();
      }
    },
    [layers, selectedLayer]
  );

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const loadImage = useCallback((src) => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setImageSrc(src);
    };
    img.src = src;
  }, []);

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      loadImage(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const updateLayer = (id, patch) => {
    setLayers((current) =>
      current.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer))
    );
  };

  const updateLayerEffect = (id, patch) => {
    setLayers((current) =>
      current.map((layer) =>
        layer.id === id
          ? {
              ...layer,
              ...patch,
              enabled: layer.hasSelection ? true : layer.enabled,
            }
          : layer
      )
    );
  };

  const updateLayerRect = (id, rectPatch) => {
    setLayers((current) =>
      current.map((layer) => {
        if (layer.id !== id) return layer;

        const nextRect = {
          ...layer.rect,
          ...rectPatch,
        };

        const hasSelection = nextRect.w > 0 && nextRect.h > 0;

        return {
          ...layer,
          rect: nextRect,
          hasSelection,
          enabled: layer.enabled && hasSelection,
        };
      })
    );
  };

  const addLayerFromCurrentSelection = () => {
    const rect = selectedLayer?.hasSelection ? selectedLayer.rect : defaultRect;
    const next = createLayer(rect, `Layer ${layers.length + 1}`);
    setLayers((current) => [...current, next]);
    setSelectedLayerId(next.id);
  };

  const duplicateLayer = () => {
    if (!selectedLayer) return;
    const next = {
      ...selectedLayer,
      id: uid(),
      name: `${selectedLayer.name} copy`,
      seed: Math.floor(Math.random() * 1000000),
    };
    setLayers((current) => [...current, next]);
    setSelectedLayerId(next.id);
  };

  const removeLayer = (id) => {
    setLayers((current) => {
      const next = current.filter((layer) => layer.id !== id);
      return next.length > 0 ? next : [createLayer(emptyRect, "Layer 1")];
    });

    if (selectedLayerId === id) {
      setSelectedLayerId("");
    }
  };

  const resetSelectedSeed = () => {
    if (!selectedLayer) return;
    updateLayer(selectedLayer.id, {
      seed: Math.floor(Math.random() * 1000000),
    });
  };

  const resetSelectedLayer = () => {
    if (!selectedLayer) return;
    const fresh = createLayer(selectedLayer.rect, selectedLayer.name);

    updateLayer(selectedLayer.id, {
      name: selectedLayer.name,
      enabled: selectedLayer.enabled && selectedLayer.hasSelection,
      hasSelection: selectedLayer.hasSelection,
      rect: { ...selectedLayer.rect },
      opacity: fresh.opacity,
      sliceCount: fresh.sliceCount,
      maxSliceHeight: fresh.maxSliceHeight,
      horizontalJitter: fresh.horizontalJitter,
      rgbShift: fresh.rgbShift,
      lineNoise: fresh.lineNoise,
      blockNoise: fresh.blockNoise,
      scanlines: fresh.scanlines,
      tintColor: fresh.tintColor,
      tintStrength: fresh.tintStrength,
      lineColor: fresh.lineColor,
      scanlineColor: fresh.scanlineColor,
      seed: fresh.seed,
    });
  };

  const pointerToCanvasPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    return { x, y };
  };

  const onPointerDown = (event) => {
    if (!selectedLayer || !imageSrc) return;

    const point = pointerToCanvasPoint(event);
    if (!point) return;

    setIsDraggingSelection(true);
    setSelectionMode(event.shiftKey ? "move" : "create");
    dragRef.current = { start: point };

    if (event.shiftKey && selectedLayer.hasSelection) {
      dragRef.current.originRect = { ...selectedLayer.rect };
      return;
    }

    updateLayerRect(selectedLayer.id, {
      x: point.x,
      y: point.y,
      w: 0.001,
      h: 0.001,
    });
  };

  const onPointerMove = (event) => {
    if (!isDraggingSelection || !selectedLayer) return;

    const point = pointerToCanvasPoint(event);
    if (!point || !dragRef.current?.start) return;

    const { start, originRect } = dragRef.current;

    if (selectionMode === "move" && originRect) {
      const dx = point.x - start.x;
      const dy = point.y - start.y;

      updateLayerRect(selectedLayer.id, {
        x: clamp(originRect.x + dx, 0, 1 - originRect.w),
        y: clamp(originRect.y + dy, 0, 1 - originRect.h),
      });
      return;
    }

    const x = Math.min(start.x, point.x);
    const y = Math.min(start.y, point.y);
    const w = Math.abs(point.x - start.x);
    const h = Math.abs(point.y - start.y);

    updateLayerRect(selectedLayer.id, {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
      w: clamp(w, 0.001, 1 - x),
      h: clamp(h, 0.001, 1 - y),
    });
  };

  const onPointerUp = () => {
    setIsDraggingSelection(false);
    dragRef.current = null;
  };

  const exportImage = async () => {
    const img = imageRef.current;
    if (!img) return;

    const exportCanvas = document.createElement("canvas");
    renderCanvas({ includeSelection: false, targetCanvas: exportCanvas });
    const filename = `glitch-export-${Date.now()}.png`;

    const fallbackDownload = () => {
      const url = exportCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    const downloadBlob = (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const openBlobPreview = (blob) => {
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");

      if (!opened) {
        window.location.href = url;
      }

      setTimeout(() => URL.revokeObjectURL(url), 60000);
      window.setTimeout(() => {
        window.alert("画像を開きました。長押しまたは共有から保存してください。");
      }, 50);
    };

    if (exportCanvas.toBlob) {
      exportCanvas.toBlob(async (blob) => {
        if (!blob) {
          fallbackDownload();
          return;
        }

        const file = new File([blob], filename, { type: "image/png" });
        const canShareFile =
          typeof navigator.share === "function" &&
          (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));

        if (canShareFile) {
          try {
            await navigator.share({
              files: [file],
              title: filename,
            });
            return;
          } catch (error) {
            if (error?.name === "AbortError") return;
          }
        }

        const isMobileDevice =
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform));

        if (isMobileDevice) {
          openBlobPreview(blob);
          return;
        }

        downloadBlob(blob);
      }, "image/png");
      return;
    }

    fallbackDownload();
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="eyebrow">Glitch editor</div>
          <h1>画像を範囲指定して、何度でもグリッジを重ねる</h1>
          <p>
            画像アップロード、範囲指定、色調整、レイヤー追加、書き出しに対応。
            1レイヤーにつき範囲は1つです。
          </p>
        </div>

        <div className="topbar-actions">
          <button onClick={() => fileInputRef.current?.click()}>画像を選ぶ</button>
          <button onClick={addLayerFromCurrentSelection}>レイヤー追加</button>
          <button onClick={exportImage} disabled={!imageSrc}>
            書き出し
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFileChange}
          />
        </div>
      </div>

      <div className="layout">
        <section className="panel preview-panel">
          <div className="panel-header">
            <span>プレビュー</span>
            <span className="muted">
              ドラッグで範囲作成 / Shift + ドラッグで範囲移動 / 1レイヤー = 1範囲
              {imageSize.width > 0 ? ` ・ ${imageSize.width} × ${imageSize.height}` : ""}
            </span>
          </div>

          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              className="preview-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            {!imageSrc && (
              <div className="empty-state">
                <div className="empty-title">画像をアップロードするとここに表示されます</div>
                <div className="empty-text">
                  最初は勝手にグリッジが入りません。ドラッグして範囲を作ったレイヤーだけ有効になります。
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="side-column">
          <section className="panel">
            <div className="panel-header">
              <span>レイヤー一覧</span>
            </div>

            <div className="layer-list">
              {layers.map((layer, index) => (
                <button
                  key={layer.id}
                  className={`layer-item ${selectedLayerId === layer.id ? "active" : ""}`}
                  onClick={() => setSelectedLayerId(layer.id)}
                >
                  <div className="layer-main">
                    <div>
                      <div className="layer-title">{layer.name || `Layer ${index + 1}`}</div>
                      <div className="layer-meta">
                        {layer.hasSelection
                          ? `1レイヤー = 1範囲 ・ ${Math.round(layer.rect.w * 100)}% × ${Math.round(
                              layer.rect.h * 100
                            )}%`
                          : "未指定 - ドラッグして範囲を作成"}
                      </div>
                    </div>

                    <div
                      className="layer-actions"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <label className="switch-wrap">
                        <input
                          type="checkbox"
                          checked={layer.enabled}
                          onChange={(e) =>
                            updateLayer(layer.id, { enabled: e.target.checked })
                          }
                          disabled={!layer.hasSelection}
                        />
                        <span>ON</span>
                      </label>
                      <button className="danger" onClick={() => removeLayer(layer.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="row-buttons">
              <button onClick={addLayerFromCurrentSelection}>追加</button>
              <button onClick={duplicateLayer}>複製</button>
            </div>
          </section>

          {selectedLayer && (
            <section className="panel">
              <div className="panel-header">
                <span>選択中レイヤーの調整</span>
              </div>

              <div className="controls">
                <label className="field">
                  <span>レイヤー名</span>
                  <input
                    type="text"
                    value={selectedLayer.name}
                    onChange={(e) =>
                      updateLayer(selectedLayer.id, { name: e.target.value })
                    }
                  />
                </label>

                <div className="grid-2">
                  <SliderField
                    label="不透明度"
                    value={selectedLayer.opacity}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { opacity: value })
                    }
                  />
                  <SliderField
                    label="RGBずれ"
                    value={selectedLayer.rgbShift}
                    min={0}
                    max={40}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { rgbShift: value })
                    }
                  />
                  <SliderField
                    label="スライス数"
                    value={selectedLayer.sliceCount}
                    min={1}
                    max={50}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { sliceCount: value })
                    }
                  />
                  <SliderField
                    label="最大スライス高"
                    value={selectedLayer.maxSliceHeight}
                    min={2}
                    max={60}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { maxSliceHeight: value })
                    }
                  />
                  <SliderField
                    label="横方向の乱れ"
                    value={selectedLayer.horizontalJitter}
                    min={0}
                    max={120}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { horizontalJitter: value })
                    }
                  />
                  <SliderField
                    label="ラインノイズ"
                    value={selectedLayer.lineNoise}
                    min={0}
                    max={50}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { lineNoise: value })
                    }
                  />
                  <SliderField
                    label="ブロックノイズ"
                    value={selectedLayer.blockNoise}
                    min={0}
                    max={40}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { blockNoise: value })
                    }
                  />
                  <SliderField
                    label="スキャンライン"
                    value={selectedLayer.scanlines}
                    min={0}
                    max={60}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { scanlines: value })
                    }
                  />
                  <SliderField
                    label="色味の強さ"
                    value={selectedLayer.tintStrength}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { tintStrength: value })
                    }
                  />
                </div>

                <div className="grid-3">
                  <ColorField
                    label="グリッジ色"
                    value={selectedLayer.tintColor}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { tintColor: value })
                    }
                  />
                  <ColorField
                    label="ライン色"
                    value={selectedLayer.lineColor}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { lineColor: value })
                    }
                  />
                  <ColorField
                    label="スキャンライン色"
                    value={selectedLayer.scanlineColor}
                    onChange={(value) =>
                      updateLayerEffect(selectedLayer.id, { scanlineColor: value })
                    }
                  />
                </div>

                <div className="subpanel">
                  <div className="subpanel-title">範囲の数値指定</div>
                  <div className="grid-2">
                    <NumberField
                      label="X"
                      value={selectedLayer.rect.x}
                      onChange={(value) =>
                        updateLayerRect(selectedLayer.id, {
                          x: clamp(value, 0, 1 - selectedLayer.rect.w),
                        })
                      }
                    />
                    <NumberField
                      label="Y"
                      value={selectedLayer.rect.y}
                      onChange={(value) =>
                        updateLayerRect(selectedLayer.id, {
                          y: clamp(value, 0, 1 - selectedLayer.rect.h),
                        })
                      }
                    />
                    <NumberField
                      label="Width"
                      value={selectedLayer.rect.w}
                      onChange={(value) =>
                        updateLayerRect(selectedLayer.id, {
                          w: clamp(value, 0.001, 1 - selectedLayer.rect.x),
                        })
                      }
                    />
                    <NumberField
                      label="Height"
                      value={selectedLayer.rect.h}
                      onChange={(value) =>
                        updateLayerRect(selectedLayer.id, {
                          h: clamp(value, 0.001, 1 - selectedLayer.rect.y),
                        })
                      }
                    />
                  </div>
                  <div className="help-text">
                    0〜1 の割合です。キャンバス上をドラッグしても更新できます。
                  </div>
                </div>

                <div className="row-buttons">
                  <button onClick={resetSelectedSeed}>乱れ方を再抽選</button>
                  <button onClick={resetSelectedLayer}>初期化</button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
