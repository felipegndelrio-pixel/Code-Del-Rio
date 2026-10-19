// Declarações mínimas para pacotes sem tipos publicados.
declare module 'bpmn-moddle' {
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    fromXML(xml: string, typeName?: string): Promise<{ rootElement: any; warnings: unknown[]; elementsById: Record<string, any>; references: unknown[] }>;
  }
}
