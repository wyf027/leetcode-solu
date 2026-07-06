# Classic Atlas

This directory contains the static HTML/CSS/JS version of the classic Chinese text atlas.

The generated raster images are intentionally not committed because the local image directory is about 902 MB. The data file in this repository uses the built-in pure-color placeholders, and `atlas.js` also falls back to the placeholder if an image path is added later but the image fails to load.
