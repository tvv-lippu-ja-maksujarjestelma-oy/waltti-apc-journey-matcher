# waltti-apc-journey-matcher

Match the APC messages from the vehicles with GTFS Realtime messages to augment the APC messages with GTFS trip metadata.

To do the matching, one needs a mapping between the vehicle IDs and the installed counting system IDs.
During the pilot phase, the mapping can be encoded in an environment variable.
After the APC pilot phase, the mapping should be managed in a separate system from this microservice, e.g. in the fleet registry.

This repository has been created as part of the [Waltti APC](https://github.com/tvv-lippu-ja-maksujarjestelma-oy/waltti-apc) project.
