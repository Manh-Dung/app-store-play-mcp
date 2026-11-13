import test from "node:test";
import assert from "node:assert/strict";
import { parseDiscoveryDoc, type DiscoveryDoc } from "../utils/discovery-parser.js";

const sampleDiscovery: DiscoveryDoc = {
  id: "androidpublisher:v3",
  name: "androidpublisher",
  version: "v3",
  title: "Google Play Android Developer API",
  resources: {
    edits: {
      methods: {
        insert: {
          id: "androidpublisher.edits.insert",
          path: "androidpublisher/v3/applications/{packageName}/edits",
          httpMethod: "POST",
          description: "Creates a new edit for an app.",
          parameters: {
            packageName: {
              type: "string",
              description: "Package name of the app.",
              required: true,
              location: "path",
            },
          },
          request: {
            $ref: "AppEdit",
          },
          response: {
            $ref: "AppEdit",
          },
        },
      },
      resources: {
        tracks: {
          methods: {
            get: {
              id: "androidpublisher.edits.tracks.get",
              path: "androidpublisher/v3/applications/{packageName}/edits/{editId}/tracks/{track}",
              httpMethod: "GET",
              description: "Gets the specified track.",
              parameters: {
                packageName: {
                  type: "string",
                  required: true,
                  location: "path",
                },
                editId: {
                  type: "string",
                  required: true,
                  location: "path",
                },
                track: {
                  type: "string",
                  required: true,
                  location: "path",
                },
              },
            },
          },
        },
      },
    },
  },
};

test("parseDiscoveryDoc extracts flat method definitions across nested resources", () => {
  const parsed = parseDiscoveryDoc(sampleDiscovery);

  assert.equal(parsed.length, 2);

  const insertMethod = parsed.find((m) => m.toolName === "edits_insert");
  assert.ok(insertMethod);
  assert.equal(insertMethod?.httpMethod, "POST");
  assert.equal(insertMethod?.parameters.length, 1);
  assert.equal(insertMethod?.parameters[0]?.name, "packageName");
  assert.equal(insertMethod?.parameters[0]?.required, true);
  assert.equal(insertMethod?.hasRequestBody, true);

  const tracksGetMethod = parsed.find((m) => m.toolName === "edits_tracks_get");
  assert.ok(tracksGetMethod);
  assert.equal(tracksGetMethod?.httpMethod, "GET");
  assert.equal(tracksGetMethod?.parameters.length, 3);
  assert.equal(tracksGetMethod?.hasRequestBody, false);
});
