"""Run a validated Gold transformation and its quality checks in Spark."""

import argparse

from pyspark.sql import SparkSession


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sql", required=True)
    parser.add_argument("--output-table", required=True)
    parser.add_argument("--quality-policies", required=True)
    args = parser.parse_args()

    spark = SparkSession.builder.appName(f"midas-{args.output_table}").getOrCreate()
    result = spark.sql(args.sql)
    policies = set(args.quality_policies.split(","))
    if not policies or policies - {"row_count_gt_zero"}:
        raise ValueError("Unsupported Gold quality policy")

    if "row_count_gt_zero" in policies and result.limit(1).count() == 0:
        raise ValueError("Gold output failed row_count_gt_zero")

    result.writeTo(args.output_table).using("iceberg").createOrReplace()
    spark.stop()


if __name__ == "__main__":
    main()
