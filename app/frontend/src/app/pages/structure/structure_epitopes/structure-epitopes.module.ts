/*
 *     Licensed under the Apache License, Version 2.0
 */

import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { StructureEpitopesComponent } from './structure-epitopes.component';
import { StructureEpitopeEntryModule } from 'pages/structure/structure_epitope_entry/structure-epitope-entry.module';

@NgModule({
    imports:      [ CommonModule, StructureEpitopeEntryModule ],
    declarations: [ StructureEpitopesComponent ],
    exports:      [ StructureEpitopesComponent ]
})
export class StructureEpitopesModule {}
