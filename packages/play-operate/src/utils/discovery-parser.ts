/**
 * Discovery Doc parser for Google Play Android Publisher API.
 */

export interface DiscoveryParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  location?: string;
  enum?: string[];
}

export interface RawMethod {
  id: string;
  path: string;
  httpMethod: string;
  description?: string;
  parameters?: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
    location?: string;
    enum?: string[];
  }>;
  request?: { $ref?: string };
  response?: { $ref?: string };
}

export interface RawResource {
  methods?: Record<string, RawMethod>;
  resources?: Record<string, RawResource>;
}

export interface DiscoveryDoc {
  id: string;
  name: string;
  version: string;
  title?: string;
  resources?: Record<string, RawResource>;
}

export interface ParsedMethod {
  id: string;
  toolName: string;
  apiMethodPath: string; // e.g. "edits.tracks.update"
  resourcePath: string[];
  methodName: string;
  description: string;
  httpMethod: string;
  path: string;
  parameters: DiscoveryParameter[];
  hasRequestBody: boolean;
  requestRef?: string;
}

/**
 * Convert camelCase or dots into snake_case for tool names.
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/\./g, "_")
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Traverse all resources recursively to extract methods.
 */
export function parseDiscoveryDoc(doc: DiscoveryDoc): ParsedMethod[] {
  const result: ParsedMethod[] = [];

  function traverse(resources: Record<string, RawResource>, pathPrefix: string[] = []): void {
    for (const [resName, resObj] of Object.entries(resources)) {
      const currentPath = [...pathPrefix, toSnakeCase(resName)];

      // Methods on this resource
      if (resObj.methods) {
        for (const [mName, mObj] of Object.entries(resObj.methods)) {
          const methodSnake = toSnakeCase(mName);
          const toolName = `${currentPath.join("_")}_${methodSnake}`;
          const apiMethodPath = mObj.id.replace(/^androidpublisher\./, "");

          const params: DiscoveryParameter[] = [];
          if (mObj.parameters) {
            for (const [pName, pObj] of Object.entries(mObj.parameters)) {
              params.push({
                name: pName,
                type: pObj.type ?? "string",
                description: pObj.description,
                required: Boolean(pObj.required),
                location: pObj.location,
                enum: pObj.enum,
              });
            }
          }

          result.push({
            id: mObj.id,
            toolName,
            apiMethodPath,
            resourcePath: currentPath,
            methodName: methodSnake,
            description: mObj.description ?? `${mObj.httpMethod} ${mObj.path}`,
            httpMethod: mObj.httpMethod,
            path: mObj.path,
            parameters: params,
            hasRequestBody: Boolean(mObj.request),
            requestRef: mObj.request?.$ref,
          });
        }
      }

      // Sub-resources
      if (resObj.resources) {
        traverse(resObj.resources, currentPath);
      }
    }
  }

  if (doc.resources) {
    traverse(doc.resources);
  }

  return result;
}

