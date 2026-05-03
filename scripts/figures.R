library(tidyverse)
library(sf)
library(rnaturalearth)
library(ggsci)
library(rcarbon)
library(patchwork)

# --- 1. Data Preparation ---
# Standardizing labels for publication
df <- read_tsv('data/raw/cturkey.tsv') %>%
  mutate(source_label = case_when(
    sourcedb == "present datasets" ~ "Global Repositories",
    sourcedb == "aadr" ~ "AADR v.66 (Integrated)",
    sourcedb == "c-turkey" ~ "C-Turkey (Current Study)",
    TRUE ~ sourcedb
  ))

# Set factor levels for consistent plotting order
db_levels <- c("Global Repositories", "AADR v.66 (Integrated)", "C-Turkey (Current Study)")
df$source_label <- factor(df$source_label, levels = db_levels)

# Geographic boundaries
turkey <- ne_countries(scale = "medium", country = "turkey", returnclass = "sf")

# --- 2. Figure 1: Spatial Distribution (Map) ---
fig1_map <- ggplot() +
  geom_sf(data = turkey, fill = "grey95", color = "grey70", size = 0.1) +
  geom_point(data = df, 
             aes(x = lon, y = lat, color = sourcedb), 
             alpha = 0.4, size = 1.2, 
             position = position_jitter(width = 0.08, height = 0.08),
             stroke = 0) +
  facet_wrap(~source_label, ncol = 1) + 
  scale_color_d3() +
  coord_sf() +
  theme_minimal(base_family = "sans") +
  theme(
    strip.text = element_text(face = "bold", size = 10),
    axis.text = element_text(size = 7, color = "grey40"),
    axis.title = element_blank(),
    legend.position = "none",
    panel.grid.major = element_line(color = "grey90", size = 0.05),
    panel.grid.minor = element_blank(),
    panel.spacing = unit(1, "lines")
  )

# --- 3. Figure 2: Temporal Density (SPD) ---
# Calibration using IntCal20
df_clean <- df %>% filter(!is.na(c14age), !is.na(c14std))
calibrated <- calibrate(x = df_clean$c14age, errors = df_clean$c14std, calCurve = 'intcal20')
bins <- binPrep(sites = df_clean$site, ages = df_clean$c14age, h = 100)

# Calculate SPD for each source
spd_all <- map_dfr(db_levels, function(s) {
  idx <- which(df_clean$source_label == s)
  s_spd <- spd(calibrated[idx], bins = bins[idx], timeRange = c(22000, 0))
  data.frame(calBP = s_spd$grid$calBP, prob = s_spd$grid$PrDens, source_label = s)
}) %>% mutate(source_label = factor(source_label, levels = db_levels))

fig2_spd <- ggplot(spd_all, aes(x = calBP, y = prob, fill = source_label)) +
  geom_area(alpha = 0.8, color = "white", size = 0.05) +
  facet_wrap(~source_label, ncol = 1, scales = "free_y") +
  scale_x_reverse(expand = c(0,0)) +
  scale_fill_d3() +
  theme_minimal(base_family = "sans") +
  theme(
    strip.text = element_text(face = "bold", size = 10),
    legend.position = "none",
    axis.title.x = element_text(size = 9, face = "bold"),
    axis.title.y = element_text(size = 9, color = "grey30"),
    axis.text = element_text(size = 8),
    panel.grid.minor = element_blank(),
    panel.spacing = unit(1, "lines")
  ) +
  labs(x = "Years cal BP", y = "Summed Probability")

# --- 4. Final Merged Figure ---
# Merging Spatial (A) and Temporal (B) perspectives
combined_fig <- (fig1_map | fig2_spd) + 
  plot_annotation(tag_levels = 'A') & 
  theme(plot.tag = element_text(face = 'bold', size = 14))

# Saving at high resolution
ggsave("results/figures/Fig1.pdf", combined_fig, width = 12, height = 8.5, dpi = 600)


##Figure 2

library(tidyverse)
library(ggsci)

# --- 1. Data Preparation & Classification ---
df_quality <- df %>%
  mutate(
    # Standardizing source names for consistency with Fig 1
    source_label = case_when(
      sourcedb == "present datasets" ~ "Global Repositories",
      sourcedb == "aadr" ~ "AADR",
      sourcedb == "c-turkey" ~ "C-Turkey (Current Study)",
      TRUE ~ sourcedb
    ),
    # Grouping materials into academic categories
    mat_group = case_when(
      str_detect(material, "(?i)bone|tooth|collagen|apatite|kemik|animal|mule|sheep|dog|horse|cattle|fur") ~ "Bone/Teeth (Human/Animal)",
      str_detect(material, "(?i)seed|grain|stone|vetch|nutshell|fruitstone|straw|plant remain") ~ "Short-lived Plants",
      str_detect(material, "(?i)charcoal|wood|twigs") ~ "Woody Plants (Charcoal)",
      str_detect(material, "(?i)soil|sediment|foraminifers|shell|seagrass|pollen|humic acid") ~ "Environmental/Soil",
      str_detect(material, "(?i)textile|bread|brain|dung|adobe|organic|clay|ceramic") ~ "Anthropic/Residues",
      TRUE ~ "Indeterminate/Other"
    ),
    # Determining Genomic Status
    dna_status = case_when(
      sourcedb == "aadr" ~ "Genomically Integrated",
      !is.na(feature) & str_detect(feature, "DNA id:") ~ "Genomically Integrated",
      TRUE ~ "Chronometric Only"
    )
  ) %>%
  mutate(
    source_label = factor(source_label, levels = c("Global Repositories", "AADR", "C-Turkey (Current Study)")),
    mat_group = factor(mat_group, levels = c("Bone/Teeth (Human/Animal)", "Short-lived Plants", "Woody Plants (Charcoal)", "Environmental/Soil", "Anthropic/Residues", "Indeterminate/Other"))
  )

# --- 2. Visualization: Stacked Bar Chart ---
fig2_quality <- ggplot(df_quality, aes(x = mat_group, fill = dna_status)) +
  geom_bar(position = "stack", alpha = 0.9, width = 0.7) +
  # Faceting by source to highlight the specific contribution of C-Turkey
  facet_grid(~source_label, scales = "free_x", space = "free_x") + 
  scale_fill_manual(values = c("Genomically Integrated" = "#E64B35FF", "Chronometric Only" = "#4DBBD5FF")) +
  theme_minimal(base_family = "sans") +
  theme(
    axis.text.x = element_text(
      angle = 45, 
      hjust = 0.9, 
      vjust = 1.1,           # Hizalamayı optimize eder
      size = 9, 
      margin = margin(t = -3) # Eksene tam yaklaşması için negatif margin
    ),
    axis.text.y = element_text(size = 9),
    strip.text = element_text(face = "bold", size = 10, color = "black"),
    strip.background = element_rect(fill = "grey95", color = "grey80"),
    legend.position = "bottom",
    legend.title = element_text(face = "bold", size = 10),
    panel.grid.major.x = element_blank(),
    panel.grid.minor = element_blank(),
    panel.spacing = unit(1.2, "lines")
  ) +
  labs(
    x = "Material Category",
    y = "Number of Samples",
    fill = "Data Integration Status"
  )

# --- 3. Save Figure ---
ggsave("results/figures/Fig2.pdf", fig2_quality, width = 11, height = 7, dpi = 300)



# --- 1. Data Preparation & Classification (Updated with Species Group) ---
df_share <- df %>%
  mutate(
    # Standardizing source names
    source_label = case_when(
      sourcedb == "present datasets" ~ "Global Repositories",
      sourcedb == "aadr" ~ "AADR",
      sourcedb == "c-turkey" ~ "C-Turkey (Current Study)",
      TRUE ~ sourcedb
    ),
    
    # 1. Broad Material Grouping
    mat_group = case_when(
      str_detect(material, "(?i)bone|tooth|collagen|apatite|kemik|animal|mule|sheep|dog|horse|cattle|fur") ~ "Bone/Teeth (Human/Animal)",
      str_detect(material, "(?i)seed|grain|stone|vetch|nutshell|fruitstone|straw|plant remain") ~ "Short-lived Plants",
      str_detect(material, "(?i)charcoal|wood|twigs") ~ "Woody Plants (Charcoal)",
      str_detect(material, "(?i)soil|sediment|foraminifers|shell|seagrass|pollen|humic acid") ~ "Environmental/Soil",
      str_detect(material, "(?i)textile|bread|brain|dung|adobe|organic|clay|ceramic") ~ "Anthropic/Residues",
      TRUE ~ "Indeterminate/Other"
    ),
    
    # 2. Species Grouping (Based on mat_group and species list)
    species_group = case_when(
      # Human vs Animal check for bones
      mat_group == "Bone/Teeth (Human/Animal)" & str_detect(species, "(?i)human") ~ "Human",
      mat_group == "Bone/Teeth (Human/Animal)" & !str_detect(species, "(?i)human") ~ "Animal",
      
      # Broad categorization for other groups
      mat_group == "Short-lived Plants" ~ "Cereal/Pulse/Seed",
      mat_group == "Woody Plants (Charcoal)" ~ "Tree/Shrub",
      mat_group == "Environmental/Soil" ~ "Mollusc/Sediment/Soil",
      mat_group == "Anthropic/Residues" ~ "Organic Residue/Artifact",
      
      TRUE ~ "Indeterminate"
    ),
    
    # 3. Determining Genomic Status
    dna_status = case_when(
      sourcedb == "aadr" ~ "Genomically Integrated",
      !is.na(feature) & str_detect(feature, "DNA id:") ~ "Genomically Integrated",
      TRUE ~ "Chronometric Only"
    )
  ) %>%
  mutate(
    source_label = factor(source_label, levels = c("Global Repositories", "AADR", "C-Turkey (Current Study)")),
    mat_group = factor(mat_group, levels = c("Bone/Teeth (Human/Animal)", "Short-lived Plants", "Woody Plants (Charcoal)", "Environmental/Soil", "Anthropic/Residues", "Indeterminate/Other")),
    species_group = factor(species_group, levels = c("Human", "Animal", "Cereal/Pulse/Seed", "Tree/Shrub", "Mollusc/Sediment/Soil", "Organic Residue/Artifact", "Indeterminate"))
  ) %>% 
  select(-comment)


write_tsv(df_share, "data/processed/cturkey_v0.tsv", na = "")
