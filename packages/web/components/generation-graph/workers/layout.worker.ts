import ELK from 'elkjs/lib/elk.bundled.js';

self.onmessage = async (e: MessageEvent) => {
  try {
    const elk = new ELK();
    // ElkJS layout returns a Promise
    const layout = await elk.layout(e.data);
    self.postMessage(layout);
  } catch (error) {
    // Send back the original graph if layout fails, or specific error structure
    self.postMessage({ error: String(error) });
  }
};
