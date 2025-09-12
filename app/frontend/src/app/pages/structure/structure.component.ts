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
import { ActivatedRoute } from '@angular/router';
import {
  IStructureCDR3SearchResult,
  IStructureCDR3SearchResultOptions,
  IStructureEpitope,
  IStructureEpitopeViewOptions,
  IStructuresMetadata,
  IStructuresMetadataTreeLevelValue
} from 'pages/structure/structure';
import { StructureSearchState } from 'pages/structure/structure.service';
import { StructureService } from 'pages/structure/structure.service';
import { fromEvent, Observable, Subscription, timer } from 'rxjs';
import {debounce, take} from 'rxjs/operators';
import { ContentWrapperService } from '../../content-wrapper.service';

@Component({
  selector:        'structure',
  templateUrl:     './structure.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StructurePageComponent implements OnInit, OnDestroy {
  private static readonly pageScrollEventDebounceTimeout: number = 10;
  private static readonly pageResizeEventDebounceTimeout: number = 200;

  private onScrollObservable: Subscription;
  private onResizeObservable: Subscription;

  public readonly metadata: Observable<IStructuresMetadata>;
  public readonly selected: Observable<IStructuresMetadataTreeLevelValue[]>;
  public readonly epitopes: Observable<IStructureEpitope[]>;
  public readonly options: Observable<IStructureEpitopeViewOptions>;
  public readonly clusters: Observable<IStructureCDR3SearchResult>;
  public readonly cdr3SearchOptions: Observable<IStructureCDR3SearchResultOptions>;

  @ViewChild('EpitopesContainer')
  public epitopesContainer: ElementRef;

  constructor(private structureService: StructureService, private contentWrapper: ContentWrapperService, private route: ActivatedRoute) {
    this.metadata = structureService.getMetadata();
    this.selected = structureService.getSelected();
    this.epitopes = structureService.getEpitopes();
    this.options = structureService.getOptions();
    this.clusters = structureService.getCDR3Clusters();
    this.cdr3SearchOptions = structureService.getCDR3SearchOptions();
  }

  public ngOnInit(): void {
    this.contentWrapper.blockScrolling();

    this.route.queryParamMap.pipe(take(1)).subscribe((params) => {
      const species = params.get('species');
      const tcrChain = params.get('tcr_chain');
      const gene = params.get('gene');
      const mhcClass = params.get('mhc_class');
      const epitopeSeq = params.get('epitope_seq');

      if (species && tcrChain && mhcClass && gene && epitopeSeq) {
        this.structureService.filterByUrl({ species, tcrChain, mhcClass, gene, epitopeSeq });

      } else {
        const cdr3Query = params.get('query');
        if (cdr3Query) {
          this.structureService.searchCDR3ByUrl(cdr3Query);
        } else {
          this.structureService.load();
        }
      }
    });

    this.onScrollObservable = fromEvent(this.epitopesContainer.nativeElement, 'scroll')
        .pipe(debounce(() => timer(StructurePageComponent.pageScrollEventDebounceTimeout))).subscribe(() => {
          this.structureService.fireScrollUpdateEvent();
        });

    this.onResizeObservable = fromEvent(window, 'resize')
        .pipe(debounce(() => timer(StructurePageComponent.pageResizeEventDebounceTimeout))).subscribe(() => {
          this.structureService.fireResizeUpdateEvent();
        });
  }

  public isEpitopesLoading(): Observable<boolean> {
    return this.structureService.isLoading();
  }

  public ngOnDestroy(): void {
    this.contentWrapper.unblockScrolling();
    this.onScrollObservable.unsubscribe();
    this.onResizeObservable.unsubscribe();
  }

  public isStateSearchTree(): boolean {
    return this.structureService.getSearchState() === StructureSearchState.SEARCH_TREE;
  }

  public isStateSearchCDR3(): boolean {
    return this.structureService.getSearchState() === StructureSearchState.SEARCH_CDR3;
  }
}
