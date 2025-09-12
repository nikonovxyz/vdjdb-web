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

import { Component, Input } from '@angular/core';
import { IStructureCluster } from 'pages/structure/structure';
import { StructureService } from 'pages/structure/structure.service';

@Component({
    selector: 'structure-epitope-cluster',
    templateUrl: './structure-epitope-cluster.component.html',
    styleUrls: ['./structure-epitope-cluster.component.css']
})
export class StructureEpitopeClusterComponent {
    @Input('cluster') public cluster: IStructureCluster;
    @Input('hit') public hit: string;
    @Input('isNormalized') public isNormalized: boolean;

    constructor(private structureService: StructureService) {}

    public exportCID(): void {
        this.structureService.members(this.cluster.clusterId);
    }
}
