/*
 *     Licensed under the Apache License, Version 2.0
 */

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { IMotifClusterMeta } from 'pages/motif/motif';
import { MotifsServiceEvents } from 'pages/motif/motif.service';
import { IStructureCluster, IStructureEpitope } from 'pages/structure/structure';
import { StructureService } from 'pages/structure/structure.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

/**
 * Represents a single epitope entry in the structure browser.  The entry
 * header displays basic epitope information and provides controls for
 * hiding/showing associated clusters and discarding the epitope.  When
 * expanded, each cluster is rendered by the StructureEpitopeClusterComponent.
 */
@Component({
    selector:        'structure-epitope-entry',
    templateUrl:     './structure-epitope-entry.component.html',
    styleUrls:       [ './structure-epitope-entry.component.css' ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StructureEpitopeEntryComponent implements OnInit, OnDestroy {
    private subscription: Subscription;

    /**
     * The meta object is derived from the first cluster of the epitope and
     * reused to display epitope metadata in the header.
     */
    public meta: IMotifClusterMeta;

    /**
     * Whether clusters associated with this epitope are hidden.  Toggled
     * when the user clicks the angle icon.
     */
    public isHidden: boolean = false;

    /**
     * Epitope to render.
     */
    @Input('epitope')
    public epitope: IStructureEpitope;

    /**
     * Indicates whether clusters should be normalised.  Passed down to
     * StructureEpitopeClusterComponent; currently unused but kept for
     * compatibility.
     */
    @Input('isNormalized')
    public isNormalized: boolean;

    /**
     * Event emitted when the user discards this epitope.
     */
    @Output('onDiscard')
    public onDiscard = new EventEmitter<IStructureEpitope>();

    constructor(private structureService: StructureService, private changeDetector: ChangeDetectorRef) {}

    /**
     * On initialization, capture the meta information from the first cluster
     * and subscribe to hide events so that the clusters can be collapsed
     * globally.
     */
    public ngOnInit(): void {
        this.meta = this.epitope.clusters[0].meta;
        this.subscription = this.structureService.getEvents().pipe(filter((event) => event === MotifsServiceEvents.HIDE_CLUSTERS)).subscribe(() => {
            this.isHidden = true;
            this.changeDetector.markForCheck();
        });
    }

    /**
     * Emit the onDiscard event when the discard icon is clicked.  The
     * StructuresEpitopesComponent will handle removal from the list.
     */
    public discard(): void {
        this.onDiscard.emit(this.epitope);
    }

    /**
     * Toggle the hidden state of the clusters.  After toggling, fire a
     * scroll update so that the viewport can be recalculated.
     */
    public hide(): void {
        this.isHidden = !this.isHidden;
        setTimeout(() => {
            this.structureService.fireScrollUpdateEvent();
        }, 50);
    }

    /**
     * Track clusters by ID in ngFor to improve rendering performance.
     */
    public trackClusterBy(_: number, item: IStructureCluster): string {
        return item.clusterId;
    }

    /**
     * Clean up the subscription on destroy.
     */
    public ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
