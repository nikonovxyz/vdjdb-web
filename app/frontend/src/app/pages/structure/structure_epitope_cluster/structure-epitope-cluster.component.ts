/*
 *     Licensed under the Apache License, Version 2.0
 */

import { Component, Input } from '@angular/core';
import { IStructureCluster } from 'pages/structure/structure';
import { StructureService } from 'pages/structure/structure.service';

/**
 * Displays a single epitope cluster for the structure browser.  The
 * component shows cluster metadata (ID, size, gene segments, etc.) and a
 * preview image of the 3D structure.  Users can export cluster members via
 * the export button.
 */
@Component({
    selector: 'structure-epitope-cluster',
    templateUrl: './structure-epitope-cluster.component.html',
    styleUrls: ['./structure-epitope-cluster.component.css']
})
export class StructureEpitopeClusterComponent {
    /**
     * Cluster object to display.  Each cluster should have an imageUrl
     * property assigned by the StructureService when the data is loaded.
     */
    @Input('cluster') public cluster: IStructureCluster;

    /**
     * Optional CDR3 hitbox string for highlighting search regions.  It is
     * unused in the structure view but kept for compatibility with the
     * motif CDR3 search component.
     */
    @Input('hit') public hit: string;

    /**
     * Indicates whether cluster statistics should be normalised.  It is
     * unused in the structure view but kept for compatibility.
     */
    @Input('isNormalized') public isNormalized: boolean;

    constructor(private structureService: StructureService) {}

    /**
     * Request export of the current cluster members.  Delegates to the
     * StructureService which internally uses the motifs API.
     */
    public exportCID(): void {
        this.structureService.members(this.cluster.clusterId);
    }
}
