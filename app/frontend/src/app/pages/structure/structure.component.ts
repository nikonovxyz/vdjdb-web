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

import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MotifSearchState } from 'pages/motif/motif.service';
import {
  IStructureCDR3SearchResult,
  IStructureCDR3SearchResultOptions,
  IStructureEpitope,
  IStructureEpitopeViewOptions,
  IStructureMetadata,
  IStructureMetadataTreeLevelValue
} from 'pages/structure/structure';
import { StructureService } from 'pages/structure/structure.service';
import { fromEvent, Observable, Subscription, timer } from 'rxjs';
import { debounce } from 'rxjs/operators';
import { ContentWrapperService } from '../../content-wrapper.service';

/**
 * Top level component for the structure browser.  It orchestrates loading
 * metadata, handling scroll and resize events, and toggles between the
 * epitope view and CDR3 search view depending on the search state.
 */
@Component({
  selector:        'structure',
  templateUrl:     './structure.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StructurePageComponent implements OnInit, OnDestroy {
  private static readonly structurePageScrollEventDebounceTimeout: number = 10;
  private static readonly structurePageResizeEventDebounceTimeout: number = 200;

  private onScrollObservable: Subscription;
  private onResizeObservable: Subscription;

  public readonly metadata: Observable<IStructureMetadata>;
  public readonly selected: Observable<IStructureMetadataTreeLevelValue[]>;
  public readonly epitopes: Observable<IStructureEpitope[]>;
  public readonly options: Observable<IStructureEpitopeViewOptions>;
  public readonly clusters: Observable<IStructureCDR3SearchResult>;
  public readonly cdr3SearchOptions: Observable<IStructureCDR3SearchResultOptions>;

  @ViewChild('EpitopesContainer')
  public epitopesContainer: ElementRef;

  constructor(private structureService: StructureService, private contentWrapper: ContentWrapperService) {
    this.metadata = structureService.getMetadata();
    this.selected = structureService.getSelected();
    this.epitopes = structureService.getEpitopes();
    this.options = structureService.getOptions();
    this.clusters = structureService.getCDR3Clusters();
    this.cdr3SearchOptions = structureService.getCDR3SearchOptions();
  }

  /**
   * Initialise the component by loading metadata and subscribing to scroll
   * and resize events.  When the component is created the application
   * content wrapper is instructed to block page scrolling.
   */
  public ngOnInit(): void {
    this.contentWrapper.blockScrolling();
    this.structureService.load();
    this.onScrollObservable = fromEvent(this.epitopesContainer.nativeElement, 'scroll')
        .pipe(debounce(() => timer(StructurePageComponent.structurePageScrollEventDebounceTimeout))).subscribe(() => {
          this.structureService.fireScrollUpdateEvent();
        });

    this.onResizeObservable = fromEvent(window, 'resize')
        .pipe(debounce(() => timer(StructurePageComponent.structurePageResizeEventDebounceTimeout))).subscribe(() => {
          this.structureService.fireResizeUpdateEvent();
        });
  }

  /**
   * Observable determining whether epitopes are being loaded.  Used by the
   * template to show a loading spinner.
   */
  public isEpitopesLoading(): Observable<boolean> {
    return this.structureService.isLoading();
  }

  /**
   * Clean up subscriptions and restore page scrolling on destroy.
   */
  public ngOnDestroy(): void {
    this.contentWrapper.unblockScrolling();
    this.onScrollObservable.unsubscribe();
    this.onResizeObservable.unsubscribe();
  }

  /**
   * Return true if the search state is the tree state, indicating that
   * epitope results should be shown.
   */
  public isStateSearchTree(): boolean {
    return this.structureService.getSearchState() === MotifSearchState.SEARCH_TREE;
  }

  /**
   * Return true if the search state is the CDR3 state, indicating that
   * CDR3 search results should be shown.
   */
  public isStateSearchCDR3(): boolean {
    return this.structureService.getSearchState() === MotifSearchState.SEARCH_CDR3;
  }
}
