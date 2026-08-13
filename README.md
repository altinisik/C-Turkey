# C-Turkey: A comprehensive radiocarbon dataset from Türkiye

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20011917.svg)](https://doi.org/10.5281/zenodo.20011917)

This repository contains the code and data associated with the **C-Turkey** dataset, a comprehensive and curated database of radiocarbon records from Türkiye.

## Project Overview

The C-Turkey dataset integrates information from global repositories with regional literature and direct dates from ancient DNA (aDNA) research. It focuses on bioarchaeological precision, providing standardized material classifications and genomic integration status for 3,390 records.

The C-Turkey dataset integrates information from global repositories (such as C14bazaar and AADR) with regional grey literature, national excavation reports, and direct bioarchaeological metadata. It focuses on chronometric precision, providing standardized material classifications and genomic integration status for 3,390 records.

- **Interactive Data Search:** All records are dynamically searchable through the [C-Turkey Dataset Explorer](https://altinisik.github.io/C-Turkey/).

- **Online Calibration Tool:** You can use the client-side [C-Turkey: Radiocarbon Calibration Tool](https://altinisik.github.io/cturkey-app/) for fast, serverless radiocarbon calibration powered by WebAssembly/Shinylive. You can also download publication ready figures. *(Note: Initial loading may take a while as the R runtime environment initializes in your browser)*.

## Repository Structure

- `data/`: Contains the raw and processed versions of the dataset including primary references.

- `scripts/`: R scripts used for data acquisition (`data_collection.R`) and figure generation (`figures.R`).

- `results/`: High-resolution figures from the associated publication.

## How to Cite

If you use this dataset or code, please cite it in addition to primary sources:

> Altınışık, N. E. (2026). C-Turkey: A comprehensive radiocarbon dataset from Türkiye (v1.0.0). Zenodo. <https://doi.org/10.5281/zenodo.20011917>
