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

import { Injectable } from '@angular/core';
import {
  IStructureCDR3SearchEntry,
  IStructureCDR3SearchResult,
  IStructureCDR3SearchResultOptions,
  IStructureCluster,
  IStructureClusterEntry,
  IStructureClusterMeta,
  IStructureClusterMembersExportResponse,
  IStructureEpitope,
  IStructureEpitopeViewOptions,
  IStructuresMetadata,
  IStructuresMetadataTreeLevel,
  IStructuresMetadataTreeLevelValue,
  IStructuresSearchTreeFilter,
  IStructuresSearchTreeFilterEntry,
  IStructuresSearchTreeFilterResult
} from 'pages/structure/structure';
import { combineLatest, Observable, ReplaySubject, Subject } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { LoggerService } from 'utils/logger/logger.service';
import { NotificationService } from 'utils/notifications/notification.service';
import { Utils } from 'utils/utils';

export namespace StructuresServiceWebSocketActions {
  export const METADATA = 'meta';
}

export namespace StructuresServiceEvents {
  export const UPDATE_SELECTED: number = 1;
  export const UPDATE_SCROLL: number = 2;
  export const UPDATE_RESIZE: number = 3;
  export const HIDE_CLUSTERS: number = 4;
}

export type StructuresServiceEvents = number;

export namespace StructureSearchState {
  export const SEARCH_TREE: number = 1;
  export const SEARCH_CDR3: number = 2;
}

export type StructureSearchState = number;

@Injectable()
export class StructureService {
  public static readonly minSubstringCDR3Length: number = 3;

  private isMetadataLoaded: boolean = false;
  private isMetadataLoading: boolean = false;
  private state: StructureSearchState = StructureSearchState.SEARCH_TREE;
  private events: Subject<StructuresServiceEvents> = new Subject<StructuresServiceEvents>();
  private metadata: Subject<IStructuresMetadata> = new ReplaySubject(1);
  private selected: Subject<IStructuresMetadataTreeLevelValue[]> = new ReplaySubject(1);
  private epitopes: Subject<IStructureEpitope[]> = new ReplaySubject(1);
  private options: Subject<IStructureEpitopeViewOptions> = new ReplaySubject(1);
  private clusters: Subject<IStructureCDR3SearchResult> = new ReplaySubject(1);
  private loadingState: Subject<boolean> = new ReplaySubject(1);

  constructor(private logger: LoggerService, private notifications: NotificationService) {}

  public async load(): Promise<void> {
    if (!this.isMetadataLoaded && !this.isMetadataLoading) {
      this.isMetadataLoading = true;
      const response = await Utils.HTTP.get('/api/structures/metadata');
      const root = JSON.parse(response.response) as { root: IStructuresMetadataTreeLevel };
      const metadata: IStructuresMetadata = { root: root.root };
      this.logger.debug('Structure metadata', metadata);
      metadata.root.values.forEach((value) => (value.isOpened = true));
      this.metadata.next(metadata);
      this.selected.next([]);
      this.epitopes.next([]);
      this.options.next({ isNormalized: false });
      this.clusters.next({ options: { cdr3: '', top: 15, gene: 'Both', substring: false }, clusters: undefined, clustersNorm: undefined });
      this.isMetadataLoaded = true;
      this.isMetadataLoading = false;
    }
  }

  public setSearchState(state: StructureSearchState): void {
    this.state = state;
  }

  public getSearchState(): StructureSearchState {
    return this.state;
  }

  public getMetadata(): Observable<IStructuresMetadata> {
    return this.metadata.asObservable();
  }

  public getEpitopes(): Observable<IStructureEpitope[]> {
    return this.epitopes.asObservable();
  }

  public getSelected(): Observable<IStructuresMetadataTreeLevelValue[]> {
    return this.selected.asObservable();
  }

  public getEvents(): Observable<StructuresServiceEvents> {
    return this.events.asObservable();
  }

  public getOptions(): Observable<IStructureEpitopeViewOptions> {
    return this.options.asObservable();
  }

  public getCDR3Clusters(): Observable<IStructureCDR3SearchResult> {
    return this.clusters.asObservable();
  }

  public getCDR3SearchOptions(): Observable<IStructureCDR3SearchResultOptions> {
    return this.clusters.asObservable().pipe(map((c) => c.options));
  }

  public setOptions(options: IStructureEpitopeViewOptions): void {
    this.options.next(options);
  }

  public fireScrollUpdateEvent(): void {
    this.events.next(StructuresServiceEvents.UPDATE_SCROLL);
  }

  public fireResizeUpdateEvent(): void {
    this.events.next(StructuresServiceEvents.UPDATE_RESIZE);
  }

  public fireHideEvent(): void {
    this.events.next(StructuresServiceEvents.HIDE_CLUSTERS);
  }

  public isLoading(): Observable<boolean> {
    return this.loadingState.asObservable();
  }

  public async searchCDR3ByUrl(query: string): Promise<void> {
    await this.load();
    this.setSearchState(StructureSearchState.SEARCH_CDR3);
    this.searchCDR3(query);
  }

  public async filterByUrl(filters: { species: string, tcrChain: string, mhcClass: string, gene: string, epitopeSeq: string, structureId?: string }): Promise<void> {
    await this.load();
    this.setSearchState(StructureSearchState.SEARCH_TREE);

    this.metadata.pipe(take(1)).subscribe((metadata) => {
      const speciesNode = metadata.root.values.find((v) => v.value === filters.species);
      if (!speciesNode) { return; }

      const tcrChainNode = speciesNode.next.values.find((v) => v.value === filters.tcrChain);
      if (!tcrChainNode) { return; }

      const mhcClassNode = tcrChainNode.next.values.find((v) => v.value === filters.mhcClass);
      if (!mhcClassNode) { return; }

      const geneNode = mhcClassNode.next.values.find((v) => v.value === filters.gene);
      if (!geneNode) { return; }

      const epitopeNode = geneNode.next.values.find((v) => v.value === filters.epitopeSeq);
      if (!epitopeNode) { return; }

      this.selectTreeLevelValue(epitopeNode);
      this.updateSelected();
    });

    const treeFilter: IStructuresSearchTreeFilter = {
      entries: [
        { name: 'species', value: filters.species },
        { name: 'gene', value: filters.tcrChain },
        { name: 'mhc.class', value: filters.mhcClass },
        { name: 'mhc.a', value: filters.gene },
        { name: 'antigen.epitope', value: filters.epitopeSeq }
      ]
    };

    this.select(treeFilter);
  }

  public searchCDR3(cdr3: string, substring: boolean = false, gene: string = 'BOTH', top: number = 15): void {
    this.setSearchState(StructureSearchState.SEARCH_CDR3);
    if (cdr3 === null || cdr3 === undefined || cdr3.length === 0) {
      this.notifications.warn('Structure CDR3', 'Empty search input');
      return;
    }
    if (substring === true && cdr3.length < StructureService.minSubstringCDR3Length) {
      this.notifications.warn('Structure CDR3', `Length of CDR3 substring should be greater or equal than ${StructureService.minSubstringCDR3Length}`);
      return;
    }
    this.loadingState.next(true);
    Utils.HTTP.post('/api/structures/cdr3', { cdr3, substring, gene, top }).then((response) => {
     const raw = JSON.parse(response.response);
      const result = this.normalizeStructureCdr3Response(raw);
      result.options.cdr3 = cdr3;
      result.options.substring = substring;
      result.options.gene = gene;
      result.options.top = top;

      const hasStructureId = (cl: IStructureCluster): boolean => {
        if (!cl) { return false; }
        const sid = typeof cl.clusterId === 'string' ? cl.clusterId.trim() : '';
        return sid.length > 0;
      };

      const clusters: IStructureCDR3SearchEntry[] = Array.isArray(result.clusters) ? [ ...result.clusters ] : [];
      const clustersNorm: IStructureCDR3SearchEntry[] = Array.isArray(result.clustersNorm) ? [ ...result.clustersNorm ] : [];

      const filteredClusters = clusters.filter((e: IStructureCDR3SearchEntry) => hasStructureId(e.cluster));
      const filteredClustersNorm = clustersNorm.filter((e: IStructureCDR3SearchEntry) => hasStructureId(e.cluster));

      filteredClusters.forEach((entry: IStructureCDR3SearchEntry) => {
        if (entry && entry.cluster && !(entry.cluster as any).rawMeta) {
          (entry.cluster as any).rawMeta = entry.cluster.meta;
        }
        this.assignStructureImageUrl(entry.cluster as IStructureCluster);
      });
      filteredClustersNorm.forEach((entry: IStructureCDR3SearchEntry) => {
        if (entry && entry.cluster && !(entry.cluster as any).rawMeta) {
          (entry.cluster as any).rawMeta = entry.cluster.meta;
        }
        this.assignStructureImageUrl(entry.cluster as IStructureCluster);
      });

      const comparator = (l: IStructureCDR3SearchEntry, r: IStructureCDR3SearchEntry) => {
        if (l.info < r.info) {
          return 1;
        } else if (l.info === r.info) {
          if (l.cluster.size < r.cluster.size) {
            return 1;
          } else if (l.cluster.size > r.cluster.size) {
            return -1;
          } else {
            return 0;
          }
        } else {
          return -1;
        }
      };

      filteredClusters.sort(comparator);
      filteredClustersNorm.sort(comparator);

      result.clusters = filteredClusters;
      result.clustersNorm = filteredClustersNorm;

      this.clusters.next(result);
      this.loadingState.next(false);
      // tslint:disable-next-line:no-magic-numbers
      this.notifications.info('Structure CDR3', 'Loaded successfully', 1000);
    }).catch(() => {
      this.loadingState.next(false);
      this.notifications.error('Structure CDR3', 'Unable to load results');
    });
  }
 
  private normalizeStructureCdr3Response(raw: any): IStructureCDR3SearchResult {
    const defaultOptions: IStructureCDR3SearchResultOptions = { cdr3: '', top: 0, gene: 'BOTH', substring: false };
    const options = raw && raw.options ? raw.options as IStructureCDR3SearchResultOptions : defaultOptions;
    const clusters = Array.isArray(raw && raw.clusters) ? raw.clusters as IStructureCDR3SearchEntry[] : [];
    const clustersNorm = Array.isArray(raw && raw.clustersNorm) ? raw.clustersNorm as IStructureCDR3SearchEntry[] : [];
    return { options, clusters, clustersNorm };
  }

  public select(treeFilter: IStructuresSearchTreeFilter): void {
    this.setSearchState(StructureSearchState.SEARCH_TREE);
    this.updateSelected();
    this.loadingState.next(true);
    Utils.HTTP.post('/api/structures/filter', treeFilter).then((response) => {
      try {
        const raw: any = JSON.parse(response.response);

        combineLatest([
          this.metadata.pipe(take(1)),
          this.epitopes.pipe(take(1))
        ]).pipe(take(1)).subscribe(([ metadata, current ]: [ IStructuresMetadata, IStructureEpitope[] ]) => {
          let result: IStructuresSearchTreeFilterResult;
          try {
            result = this.normalizeStructureFilterResult(treeFilter, raw, metadata);
          } catch (normalizationError) {
            this.loadingState.next(false);
            this.notifications.error('Structure', 'Unexpected response from /api/structures/filter');
            return;
          }

          if (!Array.isArray(result.epitopes)) {
            this.loadingState.next(false);
            this.notifications.error('Structure', 'Unexpected response from /api/structures/filter');
            return;
          }

          const hashes: string[] = current.map((ep) => ep.hash);
          const incoming: IStructureEpitope[] = (result.epitopes as unknown as IStructureEpitope[])
              .filter((ep: IStructureEpitope) => hashes.indexOf(ep.hash) === -1);

          const newEpitopes: IStructureEpitope[] = incoming
              .map((epitope: IStructureEpitope) => {
                const filteredClusters = (epitope.clusters || [])
                    .map((cluster) => {
                      if (!(cluster as any).rawMeta) {
                        (cluster as any).rawMeta = cluster.meta;
                      }
                      this.assignStructureImageUrl(cluster);
                      return cluster;
                    })
                    .filter((cluster) => !!cluster.imageUrl)
                    .sort((left, right) => right.size - left.size);
                return { ...epitope, clusters: filteredClusters };
              })
              .filter((epitope) => Array.isArray(epitope.clusters) && epitope.clusters.length > 0);

          this.epitopes.next([ ...current, ...newEpitopes ]);
          this.loadingState.next(false);
          // tslint:disable-next-line:no-magic-numbers
          this.notifications.info('Structure', 'Loaded successfully', 1000);
        });
      } catch (err) {
        this.loadingState.next(false);
        this.notifications.error('Structure', 'Unexpected response from /api/structures/filter');
      }
    }).catch(() => {
      this.loadingState.next(false);
      this.notifications.error('Structure', 'Unable to load results');
    });

  }

  public members(cid: string): void {
    Utils.HTTP.post('/api/structures/members', { cid, format: 'tsv' }).then((response) => {
      const result = JSON.parse(response.response) as IStructureClusterMembersExportResponse;
      Utils.File.download(result.link);
      this.notifications.info('Structure export', 'Download will start automatically');
    }).catch(() => {
      this.notifications.error('Structure', 'Unable to export results');
    });
  }

  public discard(_: IStructuresSearchTreeFilter): void {
    this.updateSelected();
    setImmediate(() => {
      this.updateEpitopes();
    });
  }

  public isTreeLevelValueSelected(value: IStructuresMetadataTreeLevelValue): boolean {
    if (value.next !== null) {
      return value.next.values.reduce((previous, current) => previous && this.isTreeLevelValueSelected(current), true);
    } else {
      return value.isSelected;
    }
  }

  public selectTreeLevelValue(value: IStructuresMetadataTreeLevelValue): void {
    if (value.next !== null) {
      value.next.values.forEach((v) => {
        this.selectTreeLevelValue(v);
      });
    } else {
      value.isSelected = true;
    }
  }

  public discardTreeLevelValue(value: IStructuresMetadataTreeLevelValue): void {
    if (value.next !== null) {
      value.next.values.forEach((v) => {
        this.discardTreeLevelValue(v);
      });
    } else {
      value.isSelected = false;
    }
  }

  public updateSelected(): void {
    this.metadata.pipe(take(1)).subscribe((metadata) => {
      this.selected.next(StructureService.extractMetadataTreeLeafValues(metadata.root)
          .filter(([ _, value ]) => value.isSelected)
          .map(([ _, value ]) => value)
      );
      this.events.next(StructuresServiceEvents.UPDATE_SELECTED);
      setTimeout(() => {
        this.events.next(StructuresServiceEvents.UPDATE_SCROLL);
        // tslint:disable-next-line:no-magic-numbers
      }, 100);
    });
  }

  public updateEpitopes(): void {
    combineLatest(this.selected, this.epitopes).pipe(take(1)).subscribe(([ selected, epitopes ]) => {
      const selectedEpitopeHashes = selected.map((s) => s.hash);
      const remainingEpitopes = epitopes.filter((e) => selectedEpitopeHashes.indexOf(e.hash) !== -1);
      this.epitopes.next(remainingEpitopes);
    });
  }

  public findTreeLevelValue(hash: string): Observable<IStructuresMetadataTreeLevelValue[]> {
    return this.metadata.pipe(take(1), map((metadata) => {
      return StructureService.extractMetadataTreeLeafValues(metadata.root)
          .filter(([ h, _ ]) => h === hash)
          .map(([ _, value ]) => value);
    }));
  }

  private normalizeStructureFilterResult(treeFilter: IStructuresSearchTreeFilter, raw: any, metadata: IStructuresMetadata): IStructuresSearchTreeFilterResult {
    if (raw && Array.isArray(raw.epitopes)) {
      return raw;
    }

    const entries = Array.isArray(treeFilter && treeFilter.entries) ? treeFilter.entries : [];
    const items = raw && Array.isArray(raw.items) ? raw.items : [];

    const hash = this.resolveEpitopeHashFromMetadata(metadata, entries) || this.buildFallbackHash(entries);
    const epitopeLabel = this.resolveEpitopeLabel(entries) || this.extractEpitopeFromItems(items) || 'structures';

    const clusters = items.map((item: any) => this.asStructureCluster(item));

    return {
      epitopes: [
        {
          hash,
          epitope: epitopeLabel,
          clusters
        }
      ]
    };
  }

  private resolveEpitopeHashFromMetadata(metadata: IStructuresMetadata, entries: IStructuresSearchTreeFilterEntry[]): string | undefined {
    if (!metadata || !metadata.root || !Array.isArray(entries) || entries.length === 0) {
      return undefined;
    }

    let level: IStructuresMetadataTreeLevel | null = metadata.root;
    for (let index = 0; index < entries.length; ++index) {
      const entry = entries[index];
      if (!level) {
        return undefined;
      }
      const value = level.values.find((candidate) => candidate.value === entry.value);
      if (!value) {
        return undefined;
      }
      if (index === entries.length - 1) {
        return value.hash;
      }
      level = value.next;
    }
    return undefined;
  }

  private resolveEpitopeLabel(entries: IStructuresSearchTreeFilterEntry[]): string | undefined {
    if (!Array.isArray(entries)) {
      return undefined;
    }
    const epitopeEntry = entries.slice().reverse().find((entry) => entry && entry.name === 'antigen.epitope');
    return epitopeEntry && typeof epitopeEntry.value === 'string' ? epitopeEntry.value : undefined;
  }

  private extractEpitopeFromItems(items: any[]): string | undefined {
    if (!Array.isArray(items)) {
      return undefined;
    }
    for (const item of items) {
      const meta = item && item.meta;
      const candidate = this.pickMetaValue(meta, [ 'antigen.epitope', 'antigenEpitope', 'antigen_epitope' ]);
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  }

  private asStructureCluster(item: any): IStructureCluster {
    const meta = item && typeof item.meta === 'object' ? item.meta : {};
    const clusterMeta: IStructureClusterMeta = {
      species: this.pickMetaValue(meta, [ 'species' ]) || '',
      gene: this.pickMetaValue(meta, [ 'gene' ]) || '',
      mhcclass: this.pickMetaValue(meta, [ 'mhc.class', 'mhcclass' ]) || '',
      mhca: this.pickMetaValue(meta, [ 'mhc.a', 'mhca' ]) || '',
      mhcb: this.pickMetaValue(meta, [ 'mhc.b', 'mhcb' ]) || '',
      antigenGene: this.pickMetaValue(meta, [ 'antigen.gene', 'antigenGene' ]) || '',
      antigenSpecies: this.pickMetaValue(meta, [ 'antigen.species', 'antigenSpecies' ]) || '',
      cellSubset: this.pickMetaValue(meta, [ 'cell.subset', 'cellSubset', 'cell_subset' ]) || ''
    };

    const clusterId = item && item.id ? String(item.id) : this.pickMetaValue(meta, [ 'structure.id', 'structureId' ]) || this.buildClusterIdFallback(meta);
    const entries: IStructureClusterEntry[] = [];

    const cluster: IStructureCluster = {
      clusterId,
      size: Number(item && item.size ? item.size : 1),
      length: Number(item && item.length ? item.length : 0),
      vsegm: this.pickMetaValue(meta, [ 'v', 'vsegm', 'v.segm' ]) || '',
      jsegm: this.pickMetaValue(meta, [ 'j', 'jsegm', 'j.segm' ]) || '',
      entries,
      meta: clusterMeta,
      imageUrl: item && typeof item.imageUrl === 'string' ? item.imageUrl : this.buildStructureImageUrlFallback(clusterId, item && item.cd)
    };

    (cluster as any).rawMeta = meta;
    return cluster;
  }

  private pickMetaValue(meta: any, keys: string[]): string | undefined {
    if (!meta) {
      return undefined;
    }
    for (const key of keys) {
      const candidate = meta[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return undefined;
  }

  private buildClusterIdFallback(meta: any): string {
    const base = JSON.stringify(meta || {});
    const hash = Utils.String.hashCode(base);
    return `structure:${hash}`;
  }

  private buildStructureImageUrlFallback(clusterId: string, cd: any): string | undefined {
    if (!clusterId) {
      return undefined;
    }
    const trimmedId = clusterId.trim();
    if (!trimmedId) {
      return undefined;
    }
    const numericCd = Number(cd);
    const dir = numericCd === 4 ? 'cd4' : 'cd8';
    return `/structure-files/${dir}/${trimmedId}.png`;
  }

  private buildFallbackHash(entries: IStructuresSearchTreeFilterEntry[]): string {
    return 'structures:' + JSON.stringify(entries || []);
  }

/*  private assignStructureImageUrl(cluster: IStructureCluster): void {
    try {
      let rawMeta: any = (cluster as any).rawMeta || (cluster as any).meta;
      if (typeof rawMeta === 'string') {
        try {
          rawMeta = JSON.parse(rawMeta);
        } catch {
          rawMeta = undefined;
        }
      }
      let structureId: string = '';
      if (rawMeta && typeof rawMeta === 'object') {
        const sidCandidate: any = rawMeta['structure.id'];
        if (typeof sidCandidate === 'string') {
          const trimmed = sidCandidate.trim();
          if (trimmed.length > 0) {
            structureId = trimmed;
          }
        }
      }
      if (!structureId) {
        (cluster as any).imageUrl = undefined;
        return;
      }
      let subsetRaw: string = '';
      if (rawMeta && typeof rawMeta === 'object') {
        if (typeof rawMeta['cell.subset'] === 'string') {
          subsetRaw = rawMeta['cell.subset'];
        } else if (typeof rawMeta.cellSubset === 'string') {
          subsetRaw = rawMeta.cellSubset;
        } else if (typeof rawMeta.cell_subset === 'string') {
          subsetRaw = rawMeta.cell_subset;
        }
      }
      let dir: string = 'cdr8';
      if (typeof subsetRaw === 'string') {
        const upper = subsetRaw.toUpperCase();
        if (upper.indexOf('CD4') >= 0) {
          dir = 'cdr4';
        }
      }
      (cluster as any).imageUrl = `/assets/database/structure/${dir}/${structureId}.png`;
    } catch {
      (cluster as any).imageUrl = undefined;
    }
  } */

  private assignStructureImageUrl(cluster: IStructureCluster): void {
    try {
      const already = (cluster as any).imageUrl;
      if (typeof already === 'string' && already.length > 0) {
        return;
      }

      let rawMeta: any = (cluster as any).rawMeta || (cluster as any).meta;
      if (typeof rawMeta === 'string') {
        try { rawMeta = JSON.parse(rawMeta); } catch { rawMeta = undefined; }
      }

      if (rawMeta && typeof rawMeta === 'object' && typeof cluster.clusterId === 'string' && !(rawMeta as any)['structure.id']) {
        (rawMeta as any)['structure.id'] = cluster.clusterId;
      }
      if (rawMeta && typeof rawMeta === 'object' && (rawMeta as any)['cell.subset'] === undefined) {
        const cellSubset = (cluster.meta as any && (cluster.meta as any).cellSubset) ? (cluster.meta as any).cellSubset : undefined;
        if (typeof cellSubset === 'string' && cellSubset.length > 0) {
          (rawMeta as any)['cell.subset'] = cellSubset;
        }
      }

      const sid = (rawMeta && typeof rawMeta['structure.id'] === 'string')
          ? rawMeta['structure.id'].trim() : '';
      const resolvedSid = sid || (typeof cluster.clusterId === 'string' ? cluster.clusterId.trim() : '');
      if (!resolvedSid) { (cluster as any).imageUrl = undefined; return; }

      let subsetRaw = '';
      if (rawMeta && typeof rawMeta === 'object') {
        if (typeof rawMeta['cell.subset'] === 'string') {
          subsetRaw = rawMeta['cell.subset'];
        } else if (typeof rawMeta.cellSubset === 'string') {
          subsetRaw = rawMeta.cellSubset;
        } else if (typeof rawMeta.cell_subset === 'string') {
          subsetRaw = rawMeta.cell_subset;
        }
      }

      let dir = 'cd8';
      if (typeof subsetRaw === 'string' && subsetRaw.toUpperCase().indexOf('CD4') >= 0) {
        dir = 'cd4';
      }

      (cluster as any).imageUrl = `/structure-files/${dir}/${resolvedSid}.png`;
    } catch {
      (cluster as any).imageUrl = undefined;
    }
  }

  private static extractMetadataTreeLeafValues(tree: IStructuresMetadataTreeLevel): Array<[ string, IStructuresMetadataTreeLevelValue ]> {
    return Utils.Array.flattened(tree.values.map((v) => {
      if (v.next === null) {
        return [ [ v.hash, v ] ] as Array<[ string, IStructuresMetadataTreeLevelValue ]>;
      } else {
        return StructureService.extractMetadataTreeLeafValues(v.next);
      }
    }));
  }
}
