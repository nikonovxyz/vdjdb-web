/*
 *     Copyright 2017-2019 Bagaev Dmitry
 *
 *     Licensed under the Apache License, Version 2.0 (the "License");
 *     you may not use this file except in compliance with the License.
 *     You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *     Unless required by applicable law or agreed to in writing, software
 *     distributed under the License is distributed on an "AS IS" BASIS,
 *     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *     See the License for the specific language governing permissions and
 *     limitations under the License.
 */

// The structure page reuses many of the underlying data structure from the motif
// browser. To avoid duplicating the entire type hierarchy, we simply
// re‑export the motif interfaces under structure‑specific aliases and extend
// the cluster type with an optional imageUrl property.  The imageUrl will
// point to a PNG file located under the `/assets/structure/` directory and
// should be assigned by the StructureService when loading data.

import {
  IMotifsMetadata,
  IMotifsMetadataTreeLevel,
  IMotifsMetadataTreeLevelValue,
  IMotifEpitope,
  IMotifEpitopeViewOptions,
  IMotifCluster,
  IMotifCDR3SearchEntry,
  IMotifCDR3SearchResult,
  IMotifCDR3SearchResultOptions,
  IMotifClusterMembersExportResponse
} from 'pages/motif/motif';

export type IStructureMetadata = IMotifsMetadata;
export type IStructureMetadataTreeLevel = IMotifsMetadataTreeLevel;
export type IStructureMetadataTreeLevelValue = IMotifsMetadataTreeLevelValue;

// View options for structure reuse the motif epitope view options because
// normalization toggling behaviour remains the same.
export type IStructureEpitopeViewOptions = IMotifEpitopeViewOptions;

// Extend the motif cluster interface with an optional imageUrl.  This
// property will be used by the front‑end to display a structure image
// corresponding to a given cluster.  It is intentionally optional so that
// existing motif clusters remain assignable.
export interface IStructureCluster extends IMotifCluster {
  imageUrl?: string;
}

// A structure epitope contains a collection of clusters.  Each cluster in
// turn may carry an imageUrl assigned by the StructureService.
export interface IStructureEpitope extends IMotifEpitope {
  clusters: IStructureCluster[];
}

// Entry in a CDR3 search result.  It references a cluster that is of
// structure type.
export interface IStructureCDR3SearchEntry extends IMotifCDR3SearchEntry {
  cluster: IStructureCluster;
}

// CDR3 search result adapted for structure.  Both the raw and normalized
// cluster lists contain structure‑specific entries.
export interface IStructureCDR3SearchResult extends IMotifCDR3SearchResult {
  clusters: IStructureCDR3SearchEntry[];
  clustersNorm: IStructureCDR3SearchEntry[];
}

// Re‑export the search options and export response types unmodified.
export type IStructureCDR3SearchResultOptions = IMotifCDR3SearchResultOptions;
export type IStructureClusterMembersExportResponse = IMotifClusterMembersExportResponse;
