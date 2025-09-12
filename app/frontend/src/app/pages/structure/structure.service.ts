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
import {IMotifsSearchTreeFilter} from 'pages/motif/motif';
import {MotifSearchState} from 'pages/motif/motif.service';
import {
  IStructureCDR3SearchEntry,
  IStructureCDR3SearchResult,
  IStructureCDR3SearchResultOptions,
  IStructureCluster,
  IStructureClusterMembersExportResponse,
  IStructureEpitope,
  IStructureEpitopeViewOptions,
  IStructuresMetadata,
  IStructuresMetadataTreeLevel,
  IStructuresMetadataTreeLevelValue,
  IStructuresSearchTreeFilter,
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
    this.setSearchState(MotifSearchState.SEARCH_CDR3);
    this.searchCDR3(query);
  }

  public async filterByUrl(filters: { species: string, tcrChain: string, mhcClass: string, gene: string, epitopeSeq: string }): Promise<void> {
    await this.load();

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

    const treeFilter: IMotifsSearchTreeFilter = {
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

      const result = raw.epitopes
        ? raw : {
        epitopes: [{
          hash: 'structures',
          epitope: 'structures',
          clusters: (raw.items || []).map((it: any) => ({
            size: it.size || 1,
            meta: it.meta,
            imageUrl: it.imageUrl
          }))
        }]
      } as any;

      const hasStructureId = (cl: any): boolean => {
        let meta: any = cl && cl.meta;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch { meta = undefined; }
        }
        const sid = meta && typeof meta['structure.id'] === 'string' ? meta['structure.id'].trim() : '';
        return sid.length > 0;
      };

      const clusters: IStructureCDR3SearchEntry[]     = result.clusters ? result.clusters : [];
      const clustersNorm: IStructureCDR3SearchEntry[] = result.clustersNorm ? result.clustersNorm : [];

      result.clusters     = clusters.filter((e: IStructureCDR3SearchEntry) => hasStructureId(e.cluster));
      result.clustersNorm = clustersNorm.filter((e: IStructureCDR3SearchEntry) => hasStructureId(e.cluster));

      result.clusters.forEach((entry: IStructureCDR3SearchEntry) => {
        this.assignStructureImageUrl(entry.cluster as IStructureCluster);
      });
      result.clustersNorm.forEach((entry: IStructureCDR3SearchEntry) => {
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

      result.clusters.sort(comparator);
      result.clustersNorm.sort(comparator);

      this.clusters.next(result);
      this.loadingState.next(false);
      // tslint:disable-next-line:no-magic-numbers
      this.notifications.info('Structure CDR3', 'Loaded successfully', 1000);
    }).catch(() => {
      this.loadingState.next(false);
      this.notifications.error('Structure CDR3', 'Unable to load results');
    });
  }

  public select(treeFilter: IStructuresSearchTreeFilter): void {
    this.updateSelected();
    this.loadingState.next(true);
    Utils.HTTP.post('/api/structures/filter', treeFilter).then((response) => {
      try {
        const raw: any = JSON.parse(response.response);

        // Normalize: if backend returned {items:[]}, wrap it to look like Structure's {epitopes:[{clusters:[]}]}
        const result: IStructuresSearchTreeFilterResult = (raw && Array.isArray(raw.epitopes))
            ? raw
            : {
              epitopes: [{
                // make hash unique per selection so UI can replace/append properly
                hash: 'structures:' + JSON.stringify(treeFilter && (treeFilter as any).entries ? (treeFilter as any).entries : []),
                epitope: 'structures',
                clusters: (raw && Array.isArray(raw.items))
                    ? (raw.items as any[]).map((it: any) => ({
                      size: it.size ? Number(it.size) : 1,
                      meta: it.meta,
                      imageUrl: it.imageUrl
                    }))
                    : []
              }]
            } as any;

        if (!Array.isArray(result.epitopes)) {
          throw new Error('Bad /api/structures/filter response: no epitopes[]');
        }

        const hasStructureId = (cl: any): boolean => {
          let meta: any = cl && cl.meta;
          if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = undefined; } }
          const sid = meta && typeof meta['structure.id'] === 'string' ? meta['structure.id'].trim() : '';
          return sid.length > 0;
        };

        this.epitopes.pipe(take(1)).subscribe((epitopes: IStructureEpitope[]) => {
          const hashes: string[] = epitopes.map((ep) => ep.hash);
          const incoming: IStructureEpitope[] = (result.epitopes as unknown as IStructureEpitope[])
              .filter((ep: IStructureEpitope) => hashes.indexOf(ep.hash) === -1);

          const newEpitopes: IStructureEpitope[] = incoming
              .map((n: IStructureEpitope) => {
                const all: IStructureCluster[] = (n.clusters ? n.clusters : []).filter(hasStructureId) as any;
                all.forEach((cl: IStructureCluster) => this.assignStructureImageUrl(cl));
                const filtered: IStructureCluster[] = all
                    .filter((cl: any) => !!(cl as any).imageUrl)
                    .sort((l: IStructureCluster, r: IStructureCluster) => r.size - l.size);
                return { ...n, clusters: filtered };
              })
              .filter((e: IStructureEpitope) => !!e.clusters && e.clusters.length > 0);

          this.epitopes.next([ ...epitopes, ...newEpitopes ]);
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

/*  private assignStructureImageUrl(cluster: IStructureCluster): void {
    try {
      let rawMeta: any = (cluster as any).meta;
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

      let rawMeta: any = (cluster as any).meta;
      if (typeof rawMeta === 'string') {
        try { rawMeta = JSON.parse(rawMeta); } catch { rawMeta = undefined; }
      }

      const sid = (rawMeta && typeof rawMeta['structure.id'] === 'string')
          ? rawMeta['structure.id'].trim() : '';
      if (!sid) { (cluster as any).imageUrl = undefined; return; }

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

      (cluster as any).imageUrl = `/structure-files/${dir}/${sid}.png`;
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
