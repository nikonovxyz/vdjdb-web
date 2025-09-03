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
  IMotifsSearchTreeFilter,
  IMotifsSearchTreeFilterResult
} from 'pages/motif/motif';
import {
  IStructureCDR3SearchEntry,
  IStructureCDR3SearchResult,
  IStructureCDR3SearchResultOptions,
  IStructureCluster,
  IStructureClusterMembersExportResponse,
  IStructureEpitope,
  IStructureEpitopeViewOptions,
  IStructureMetadata,
  IStructureMetadataTreeLevel,
  IStructureMetadataTreeLevelValue
} from 'pages/structure/structure';
import { combineLatest, Observable, ReplaySubject, Subject } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { LoggerService } from 'utils/logger/logger.service';
import { NotificationService } from 'utils/notifications/notification.service';
import { Utils } from 'utils/utils';

// Reuse search states and event constants from the motif service so that
// existing components (e.g. motif-search-util) continue to function
import {
  MotifSearchState,
  // MotifService,
  MotifsServiceEvents
} from 'pages/motif/motif.service';

/**
 * StructureService mirrors the MotifService but augments cluster objects
 * with imageUrl properties.  It delegates all API calls to the existing
 * motifs backend endpoints so no additional backend work is necessary.
 */
@Injectable()
export class StructureService {
  /**
   * Minimum allowed substring length when performing CDR3 substring search.
   */
  public static readonly minSubstringCDR3Length: number = 3;

  /**
   * Internal flags to track whether metadata has been loaded.
   */
  private isMetadataLoaded: boolean = false;
  private isMetadataLoading: boolean = false;

  /**
   * Current search state.  Reuses the enumeration defined in MotifService so
   * that other components can continue using existing constants.
   */
  private state: MotifSearchState = MotifSearchState.SEARCH_TREE;

  /**
   * Service event stream.  Subscribers receive notifications when the
   * selection changes, when the scroll or resize events fire, or when
   * clusters should be hidden.
   */
  private events: Subject<MotifsServiceEvents> = new Subject<MotifsServiceEvents>();

  /**
   * Metadata tree describing available epitopes.  It is populated on
   * `load()` and exposed as an observable.
   */
  private metadata: Subject<IStructureMetadata> = new ReplaySubject(1);

  /**
   * Observable holding the currently selected tree values.
   */
  private selected: Subject<IStructureMetadataTreeLevelValue[]> = new ReplaySubject(1);

  /**
   * List of epitopes currently loaded in the viewport.  Each epitope
   * includes a set of clusters with assigned imageUrl values.
   */
  private epitopes: Subject<IStructureEpitope[]> = new ReplaySubject(1);

  /**
   * Controls whether motif clusters are normalized or displayed in raw
   * frequencies.  The view toggles normalised vs raw via this object.
   */
  private options: Subject<IStructureEpitopeViewOptions> = new ReplaySubject(1);

  /**
   * List of clusters retrieved via a CDR3 search.  Both raw and normalized
   * lists are stored here.  Cluster objects in these lists have imageUrl
   * assigned.
   */
  private clusters: Subject<IStructureCDR3SearchResult> = new ReplaySubject(1);

  /**
   * Emits true while an HTTP request is outstanding.
   */
  private loadingState: Subject<boolean> = new ReplaySubject(1);

  constructor(private logger: LoggerService, private notifications: NotificationService) {}

  /**
   * Loads the structure metadata tree from the backend.  This method reuses
   * the `/api/motifs/metadata` endpoint and simply forwards the result
   * directly.  Metadata loading is performed only once during the life
   * cycle of the application.
   */
  public async load(): Promise<void> {
    if (!this.isMetadataLoaded && !this.isMetadataLoading) {
      this.isMetadataLoading = true;
      const response = await Utils.HTTP.get('/api/motifs/metadata');
      const root = JSON.parse(response.response) as { root: IStructureMetadataTreeLevel };
      const metadata: IStructureMetadata = { root: root.root };
      this.logger.debug('Structures metadata', metadata);

      // Open all leafs by default so that the tree is expanded initially.
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

  /**
   * Updates the current search state.  See MotifSearchState for available
   * values.
   */
  public setSearchState(state: MotifSearchState): void {
    this.state = state;
  }

  /**
   * Returns the current search state.
   */
  public getSearchState(): MotifSearchState {
    return this.state;
  }

  /**
   * Expose metadata as an observable.
   */
  public getMetadata(): Observable<IStructureMetadata> {
    return this.metadata.asObservable();
  }

  /**
   * Expose loaded epitopes as an observable.
   */
  public getEpitopes(): Observable<IStructureEpitope[]> {
    return this.epitopes.asObservable();
  }

  /**
   * Expose selected tree nodes as an observable.
   */
  public getSelected(): Observable<IStructureMetadataTreeLevelValue[]> {
    return this.selected.asObservable();
  }

  /**
   * Expose events stream as an observable.  Components subscribe to this
   * stream to be notified about scroll/resize/hide events.
   */
  public getEvents(): Observable<MotifsServiceEvents> {
    return this.events.asObservable();
  }

  /**
   * Expose epitope view options as an observable.
   */
  public getOptions(): Observable<IStructureEpitopeViewOptions> {
    return this.options.asObservable();
  }

  /**
   * Expose clusters from CDR3 search as an observable.
   */
  public getCDR3Clusters(): Observable<IStructureCDR3SearchResult> {
    return this.clusters.asObservable();
  }

  /**
   * Expose CDR3 search options as an observable.
   */
  public getCDR3SearchOptions(): Observable<IStructureCDR3SearchResultOptions> {
    return this.clusters.asObservable().pipe(map((c) => c.options));
  }

  /**
   * Update epitope view options.  Toggling normalization for example will
   * trigger update of the view.
   */
  public setOptions(options: IStructureEpitopeViewOptions): void {
    this.options.next(options);
  }

  /**
   * Fire a scroll update event.  Components should update their view if
   * content comes into or out of view.
   */
  public fireScrollUpdateEvent(): void {
    this.events.next(MotifsServiceEvents.UPDATE_SCROLL);
  }

  /**
   * Fire a resize update event.  Components should update their view when
   * viewport dimensions change.
   */
  public fireResizeUpdateEvent(): void {
    this.events.next(MotifsServiceEvents.UPDATE_RESIZE);
  }

  /**
   * Fire a hide event causing epitope clusters to be collapsed in the view.
   */
  public fireHideEvent(): void {
    this.events.next(MotifsServiceEvents.HIDE_CLUSTERS);
  }

  /**
   * Observable indicating whether an HTTP request is in progress.  Can be
   * used by templates to display loading spinners.
   */
  public isLoading(): Observable<boolean> {
    return this.loadingState.asObservable();
  }

  /**
   * Perform a CDR3 search against the motifs API.  The result will be
   * sorted by informativeness and cluster size, normalized or raw lists are
   * stored separately.  Each returned cluster receives an imageUrl based
   * on its clusterId.
   */
  public searchCDR3(cdr3: string, substring: boolean = false, gene: string = 'BOTH', top: number = 15): void {
    if (cdr3 === null || cdr3 === undefined || cdr3.length === 0) {
      this.notifications.warn('Structures CDR3', 'Empty search input');
      return;
    }
    if (substring === true && cdr3.length < StructureService.minSubstringCDR3Length) {
      this.notifications.warn('Structures CDR3', `Length of CDR3 substring should be greater or equal than ${StructureService.minSubstringCDR3Length}`);
      return;
    }
    this.loadingState.next(true);
    Utils.HTTP.post('/api/motifs/cdr3', { cdr3, substring, gene, top }).then((response) => {
      const result = JSON.parse(response.response) as IStructureCDR3SearchResult;

      // Sort clusters by informativeness and size.  This comparator is
      // identical to that used in the motif service.
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

      // Assign image URLs to clusters in both raw and normalized lists.
      result.clusters.forEach((entry) => {
        (entry.cluster as IStructureCluster).imageUrl = `/assets/structures/${entry.cluster.clusterId}.png`;
      });
      result.clustersNorm.forEach((entry) => {
        (entry.cluster as IStructureCluster).imageUrl = `/assets/structures/${entry.cluster.clusterId}.png`;
      });

      this.clusters.next(result);
      this.loadingState.next(false);
      this.notifications.info('Structures CDR3', 'Loaded successfully', 1000);
    }).catch(() => {
      this.loadingState.next(false);
      this.notifications.error('Structures CDR3', 'Unable to load results');
    });
  }

  /**
   * Filter epitopes by a search tree filter.  Newly returned epitopes are
   * appended to the existing list after sorting clusters and assigning
   * imageUrl properties.
   */
  public select(treeFilter: IMotifsSearchTreeFilter): void {
    this.updateSelected();
    this.loadingState.next(true);
    Utils.HTTP.post('/api/motifs/filter', treeFilter).then((response) => {
      const result = JSON.parse(response.response) as IMotifsSearchTreeFilterResult;
      this.epitopes.pipe(take(1)).subscribe((epitopes) => {
        const hashes = epitopes.map((epitope) => epitope.hash);
        const newEpitopes = result.epitopes.filter((epitope) => hashes.indexOf(epitope.hash) === -1) as IStructureEpitope[];

        newEpitopes.forEach((n) => {
          // Sort clusters by size descending.
          n.clusters.sort((l: IStructureCluster, r: IStructureCluster) => {
            if (l.size < r.size) {
              return 1;
            } else if (l.size > r.size) {
              return -1;
            } else {
              return 0;
            }
          });
          // Assign image URLs to each cluster.
          n.clusters.forEach((cluster) => {
            cluster.imageUrl = `/assets/structures/${cluster.clusterId}.png`;
          });
        });

        this.epitopes.next([ ...epitopes, ...newEpitopes ]);
        this.loadingState.next(false);
        this.notifications.info('Structures', 'Loaded successfully', 1000);
      });
    }).catch(() => {
      this.loadingState.next(false);
      this.notifications.error('Structures', 'Unable to load results');
    });
  }

  /**
   * Export cluster members for a given cluster ID.  Uses the motifs API and
   * triggers a file download when the link becomes available.
   */
  public members(cid: string): void {
    Utils.HTTP.post('/api/motifs/members', { cid, format: 'tsv' }).then((response) => {
      const result = JSON.parse(response.response) as IStructureClusterMembersExportResponse;
      Utils.File.download(result.link);
      this.notifications.info('Structures export', 'Download will start automatically');
    }).catch(() => {
      this.notifications.error('Structures', 'Unable to export results');
    });
  }

  /**
   * Discard the selected nodes and update epitopes.  Internally this
   * delegates to updateSelected() and updateEpitopes().
   */
  public discard(_: IMotifsSearchTreeFilter): void {
    this.updateSelected();
    setImmediate(() => {
      this.updateEpitopes();
    });
  }

  /**
   * Determine whether a metadata tree node is selected.  Works recursively
   * through child nodes.
   */
  public isTreeLevelValueSelected(value: IStructureMetadataTreeLevelValue): boolean {
    if (value.next !== null) {
      return value.next.values.reduce((previous, current) => previous && this.isTreeLevelValueSelected(current), true);
    } else {
      return value.isSelected;
    }
  }

  /**
   * Mark a metadata tree node as selected.  Recursively selects all leaf
   * nodes beneath the provided node.
   */
  public selectTreeLevelValue(value: IStructureMetadataTreeLevelValue): void {
    if (value.next !== null) {
      value.next.values.forEach((v) => {
        this.selectTreeLevelValue(v);
      });
    } else {
      value.isSelected = true;
    }
  }

  /**
   * Mark a metadata tree node as discarded (unselected).  Recursively
   * descends through child nodes.
   */
  public discardTreeLevelValue(value: IStructureMetadataTreeLevelValue): void {
    if (value.next !== null) {
      value.next.values.forEach((v) => {
        this.discardTreeLevelValue(v);
      });
    } else {
      value.isSelected = false;
    }
  }

  /**
   * Update the internal selected list by collecting all leaf values that
   * have isSelected = true.  Also fires scroll events after a brief delay
   * so that components can recompute their viewport state.
   */
  public updateSelected(): void {
    this.metadata.pipe(take(1)).subscribe((metadata) => {
      this.selected.next(StructureService.extractMetadataTreeLeafValues(metadata.root)
          .filter(([ _, value ]) => value.isSelected)
          .map(([ _, value ]) => value)
      );
      this.events.next(MotifsServiceEvents.UPDATE_SELECTED);
      setTimeout(() => {
        this.events.next(MotifsServiceEvents.UPDATE_SCROLL);
      }, 100);
    });
  }

  /**
   * Update the epitopes list by removing epitopes whose hash is no longer
   * contained in the selected list.
   */
  public updateEpitopes(): void {
    combineLatest(this.selected, this.epitopes).pipe(take(1)).subscribe(([ selected, epitopes ]) => {
      const selectedEpitopeHashes = selected.map((s) => s.hash);
      const remainingEpitopes = epitopes.filter((e) => selectedEpitopeHashes.indexOf(e.hash) !== -1);
      this.epitopes.next(remainingEpitopes);
    });
  }

  /**
   * Find tree nodes matching the specified epitope hash.  Returns an
   * observable that yields a list of matching values.
   */
  public findTreeLevelValue(hash: string): Observable<IStructureMetadataTreeLevelValue[]> {
    return this.metadata.pipe(take(1), map((metadata) => {
      return StructureService.extractMetadataTreeLeafValues(metadata.root)
          .filter(([ h, _ ]) => h === hash)
          .map(([ _, value ]) => value);
    }));
  }

  /**
   * Helper to recursively flatten the metadata tree and return leaf hashes
   * along with their corresponding tree values.  This function is adapted
   * from the motif service.
   */
  private static extractMetadataTreeLeafValues(tree: IStructureMetadataTreeLevel): Array<[ string, IStructureMetadataTreeLevelValue ]> {
    return Utils.Array.flattened(tree.values.map((v) => {
      if (v.next === null) {
        return [ [ v.hash, v ] ] as Array<[ string, IStructureMetadataTreeLevelValue ]>;
      } else {
        return StructureService.extractMetadataTreeLeafValues(v.next);
      }
    }));
  }
}
