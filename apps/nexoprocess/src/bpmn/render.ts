// Renderização off-screen com bpmn-js para exportar SVG/PNG e montar o relatório.
import type { Theme } from '../state/theme';

export const RENDER_COLORS: Record<Theme, { fill: string; stroke: string; label: string }> = {
  dark: { fill: '#0f1b33', stroke: '#9fb3d1', label: '#e8eef8' },
  light: { fill: '#ffffff', stroke: '#334155', label: '#0b1220' },
};

export async function createViewer(container: HTMLElement, theme: Theme, navigated = true) {
  const mod = navigated ? await import('bpmn-js/lib/NavigatedViewer') : await import('bpmn-js/lib/Viewer');
  const Viewer = mod.default as any;
  const c = RENDER_COLORS[theme];
  return new Viewer({
    container,
    bpmnRenderer: { defaultFillColor: c.fill, defaultStrokeColor: c.stroke, defaultLabelColor: c.label },
    textRenderer: { defaultStyle: { fontFamily: 'Inter, system-ui, Arial, sans-serif', fontSize: 12 } },
  });
}

/** SVG de cada plano pedido, na ordem. id vazio = plano macro (deve vir primeiro). */
export async function renderAllSvgs(xml: string, rootIds: { id: string; label: string }[], theme: Theme = 'light'): Promise<{ id: string; label: string; svg: string }[]> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1400px;height:900px;';
  document.body.appendChild(host);
  try {
    const viewer = await createViewer(host, theme, false);
    await viewer.importXML(xml);
    const canvas = viewer.get('canvas');
    const out: { id: string; label: string; svg: string }[] = [];
    for (const r of rootIds) {
      const root = r.id ? canvas.findRoot(`${r.id}_plane`) : undefined;
      if (r.id && !root) continue;
      if (root) canvas.setRootElement(root);
      const { svg } = await viewer.saveSVG();
      out.push({ id: r.id, label: r.label, svg });
    }
    viewer.destroy();
    return out;
  } finally {
    host.remove();
  }
}

/** Converte SVG em PNG (escala 2× para nitidez). */
export async function svgToPng(svg: string, background: string): Promise<Blob> {
  const m = /viewBox="([\d.\-\s]+)"/.exec(svg);
  const [, , w0, h0] = m ? m[1].split(/\s+/).map(Number) : [0, 0, 1200, 800];
  const w = Math.ceil(w0 || 1200);
  const h = Math.ceil(h0 || 800);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Falha ao rasterizar o SVG'));
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG vazio'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
