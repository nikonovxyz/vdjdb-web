/*
 *     Licensed under the Apache License, Version 2.0
 */

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { StructureEpitopeClusterComponent } from './structure-epitope-cluster.component';

@NgModule({
    imports:      [ CommonModule ],
    declarations: [ StructureEpitopeClusterComponent ],
    exports:      [ StructureEpitopeClusterComponent ]
})
export class StructureEpitopeClusterModule {}
