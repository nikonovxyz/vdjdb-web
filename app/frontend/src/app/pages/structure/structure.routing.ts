/*
 *     Licensed under the Apache License, Version 2.0
 */

import { RouterModule, Routes } from '@angular/router';
import { StructurePageComponent } from 'pages/structure/structure.component';

const routes: Routes = [
  { path: '', component: StructurePageComponent }
];

export const StructurePageRouting = RouterModule.forChild(routes);
