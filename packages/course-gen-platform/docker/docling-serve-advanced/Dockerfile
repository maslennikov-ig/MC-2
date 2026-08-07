# syntax=docker/dockerfile:1.7
#
# Advanced enrichment profile: the SAME Serve build as the baseline, plus the
# model set the baseline deliberately does not carry.
#
# It exists because the accepted model set does not fit the baseline envelope.
# `granite-vision-3.3-2b-chart2csv` alone is ~6 GB on disk and several GB
# resident, and the baseline Serve is capped at 4 GiB with zero restarts as a
# non-functional requirement. Adding these models to the baseline image would
# put every ordinary conversion behind a load it never needs.
#
# Building FROM the baseline image rather than from upstream keeps ONE code
# base: the pinned dependency lock, the heading-hierarchy runtime glue and the
# entrypoint are inherited, so the two profiles can only differ by models and
# configuration.
ARG BASE_IMAGE=mc2/docling-serve:1.30.0-docling-2.118.0
FROM ${BASE_IMAGE}

LABEL org.opencontainers.image.title="MegaCampus Docling Serve (advanced enrichments)"
LABEL org.opencontainers.image.version="1.30.0-docling-2.118.0-advanced"

USER 1001

# WHICH models this image carries is a deployment decision, not a constant.
#
# The default is `code_formula` alone — 611 MB on disk, measured peak 1.46 GiB —
# because that is what fits the production host. The chart model is
# `ibm-granite/granite-vision-4.1-4b`: 7.5 GB on disk and a measured 4.34 GiB
# peak, on a server whose compose limits already sum to about twice its RAM.
# Carrying it "just in case" would put a 4-billion-parameter vision model in the
# hot path of every document upload.
#
# Build the heavy profile explicitly when a host can hold it:
#
#   docker build --build-arg ADVANCED_MODEL_SET="code_formula granite_chart_extraction_v4" .
#
# `granite_chart_extraction_v4` and not the smaller 3.3-2b `chart2csv`:
# `do_chart_extraction` is a plain boolean with no preset registry behind it and
# this Serve build hardcodes `ChartExtractionModelGraniteVisionV4`. MEASURED on
# 2026-08-06 with only the 2b model present, the request failed and the log read
# "Model artifacts not found at .../ibm-granite--granite-vision-4.1-4b, they
# will be downloaded" — an artifacts_path service reaching for the network
# mid-request.
#
# `smolvlm` is deliberately absent. Its capability (picture description) is
# rejected on measured evidence, and the download is 3.3 GB of which 2.9 GB is
# an `onnx/` tree this runtime cannot even open — it uses the transformers
# engine. Stage D re-adds whatever VLM it decides to measure.
#
# `picture_classifier` is already in the baseline image and is NOT re-downloaded.
ARG ADVANCED_MODEL_SET="code_formula"
RUN HF_HUB_DOWNLOAD_TIMEOUT=600 HF_HUB_ETAG_TIMEOUT=600 \
    docling-tools models download \
      -o /opt/app-root/src/.cache/docling/models \
      ${ADVANCED_MODEL_SET}

# A missing model does not degrade gracefully — Serve answers 404 with a
# message about a task result, and the real cause is only in its log. So the
# build refuses to ship an image whose model set does not match its promise.
ENV DOCLING_ADVANCED_MODEL_SET=${ADVANCED_MODEL_SET}

COPY test_models.py /opt/app-root/src/
RUN cd /opt/app-root/src \
    && python -m unittest -v test_models.py \
    && rm /opt/app-root/src/test_models.py

ENV DOCLING_SERVE_ENRICHMENT_PROFILE=advanced
