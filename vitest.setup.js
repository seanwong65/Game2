// jsdom doesn't implement scrollTo or DragEvent
window.scrollTo = () => {};

if (typeof DragEvent === 'undefined') {
  global.DragEvent = class DragEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.dataTransfer = init.dataTransfer ?? {
        data: {},
        effectAllowed: '',
        setData(k, v) { this.data[k] = v; },
        getData(k) { return this.data[k]; },
      };
    }
  };
}
