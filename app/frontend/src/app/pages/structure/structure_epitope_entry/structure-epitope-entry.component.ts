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

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { IStructureClusterMeta, IStructureCluster, IStructureEpitope } from 'pages/structure/structure';
import { StructuresServiceEvents } from 'pages/structure/structure.service';
import { StructureService } from 'pages/structure/structure.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
    selector:        'structure-epitope-entry',
    templateUrl:     './structure-epitope-entry.component.html',
    styleUrls:       [ './structure-epitope-entry.component.css' ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StructureEpitopeEntryComponent implements OnInit, OnDestroy {
    private subscription: Subscription;
    public meta: IStructureClusterMeta;
    public isHidden: boolean = false;
    @Input('epitope') public epitope: IStructureEpitope;
    @Input('isNormalized') public isNormalized: boolean;
    @Output('onDiscard') public onDiscard = new EventEmitter<IStructureEpitope>();

    constructor(private structureService: StructureService, private changeDetector: ChangeDetectorRef) {}

    public ngOnInit(): void {
        this.meta = this.epitope.clusters[0].meta;
        this.subscription = this.structureService.getEvents().pipe(filter((event) => event === StructuresServiceEvents.HIDE_CLUSTERS)).subscribe(() => {
            this.isHidden = true;
            this.changeDetector.markForCheck();
        });
    }

    public discard(): void {
        this.onDiscard.emit(this.epitope);
    }

    public hide(): void {
        this.isHidden = !this.isHidden;
        setTimeout(() => {
            this.structureService.fireScrollUpdateEvent();
            // tslint:disable-next-line:no-magic-numbers
        }, 50);
    }

    public trackClusterBy(_: number, item: IStructureCluster): string {
        return item.clusterId;
    }

    public ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
