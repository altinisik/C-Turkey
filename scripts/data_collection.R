# ==============================================================================
# Project: C-Turkey - Radiocarbon Dataset for Anatolia
# Script: Data Acquisition and Initial Processing
# Description: Automated harvest of radiocarbon dates from global databases
#              using the c14bazAAR package.
# Author: N. Ezgi Altınışık
# Date: 2026 (Last Update: 25.04.2025)
# Annotated by Gemini Pro
# ==============================================================================

# --- 1. Load Required Libraries ---
library(magrittr)
library(Bchron)
library(tidyverse) # Includes dplyr, ggplot2, and readr
library(c14bazAAR)

# Note: plyr is loaded last to avoid masking issues with dplyr, 
# though dplyr's specialized functions are preferred for performance.
library(plyr) 

# --- 2. Initial Data Acquisition ---
# Extracting data from 12 distinct international repositories
c14dates <- get_c14data(databases = c(
  "nerd", "14sea", "calpal", "rado.nb", "14cpalaeolithic", 
  "agrichange", "BDA", "eubar", "euroevol", "katsianis", 
  "pacea", "p3k14c"
)) 

# --- 3. Processing Türkiye-specific Data ---
# Filtering and cleaning the dataset for the study region
c14datesTR <- c14dates %>% 
  # Isolate entries for Türkiye using common naming variations
  filter(country %in% c("Turkey", "TR", "Turquie")) %>%
  
  # Quality Control: Filter by uncalibrated standard error (< 150 years)
  filter(c14std >= 0, c14std < 150) %>%
  
  # Deduplication: Remove overlapping entries with priority given to the 'nerd' database
  remove_duplicates(preferences = "nerd") %>%
  
  # Calibration: Apply IntCal20 calibration curve
  calibrate(calCurves = rep("intcal20", length(.$c14age))) %>%
  
  # Post-calibration Processing: Unnest and calculate density stats
  unnest(calrange) %>% 
  dplyr::group_by(labnr, site, feature) %>%
  dplyr::mutate(
    totaldens = sum(dens),
    minval = min(to), 
    maxval = max(from)
  ) %>%
  
  # Filtering by cumulative density and removing redundant entries
  dplyr::filter(totaldens < 100) %>% 
  dplyr::distinct(labnr, site, feature, .keep_all = TRUE)

# --- 4. Exporting Processed Data ---
# Saving local copies (Replace these paths with relative repo paths for GitHub)
write_tsv(c14datesTR, "data/raw/calDatesTRClean_250425.tsv")
write_tsv(c14dates, "data/raw/calDatesAllNotClean.tsv")

# --- 5. Global Metadata Enrichment & Country Determination ---
# Processing global data with coordinate-based country assignment
c14datesCal <- c14dates %>%
  filter(!is.na(lat), !is.na(lon)) %>%
  filter(c14std >= 0, c14std < 150) %>%
  remove_duplicates() %>%
  
  # Assign country names based on spatial coordinates
  determine_country_by_coordinate() %>%
  
  # Secondary Calibration
  calibrate(calCurves = rep("intcal20", length(.$c14age))) %>%
  unnest(calrange) %>% 
  dplyr::group_by(labnr, site, feature) %>%
  dplyr::mutate(
    totaldens = sum(dens),
    minval = min(to), 
    maxval = max(from)
  ) %>%
  dplyr::filter(totaldens < 100) %>% 
  dplyr::distinct(labnr, site, feature, .keep_all = TRUE)

# Save enriched dataset
write_tsv(c14datesCal, "data/raw/calDates_Enriched.tsv")

# --- 6. Formatting & Character Standardization ---
# Function to convert Turkish characters to plain English for compatibility
to.plain <- function(s) {
  old1 <- "çğşıüöÇĞŞİÖÜ"
  new1 <- "cgsiuoCGSIOU"
  s1 <- chartr(old1, new1, s)
  return(s1)
}

# Apply character conversion to site names and filter columns for final output
c14datFilt <- c14datesCal %>%
  rowwise() %>% 
  mutate(
    avDate = mean(c(max_Cal_BP, min_Cal_BP)), 
    calBP = paste0(max_Cal_BP, "-", min_Cal_BP, " cal BP")
  ) %>%
  select(
    "sourcedb", "sourcedb_version", "labnr", "site",
    "c14age", "c14std", "CI",
    "max_Cal_BP", "min_Cal_BP", "avDate", "calBP",
    "period", "material_thes", "country_coord",
    "country_thes", "lat", "lon", "shortref"
  )

# Cleanup site names
c14datFilt$site <- as.vector(sapply(c14datFilt$site, to.plain))

# Export the final cleaned and standardized dataset
write_tsv(c14datFilt, "data/processed/calDates6dbClean.tsv")