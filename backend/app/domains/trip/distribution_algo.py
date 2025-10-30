import time
from typing import List, Tuple, Any

from shapely import Point, Polygon, MultiPolygon
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from app.entrypoint.routes.common.errors import BadRequestError
from models.common import Customer
from typing import List, Tuple, Optional
import osmnx as ox
import networkx as nx
from shapely.geometry import Point, MultiPoint
from geoalchemy2.shape import to_shape

from models.common import Customer
from typing import List, Tuple
import numpy as np
import math
from itertools import combinations

from sklearn.cluster import KMeans
from pyproj import Transformer
from geoalchemy2.shape import to_shape

from models.common import Customer
from osmnx import truncate

from app.domains.trip.saleman_router import SalesmanRouterMixin


class DistributionAlgorithm:

    def __init__(self, uow: SqlAlchemyUnitOfWork):
        self.uow = uow

    def run(self,
            polygons: MultiPolygon,
            start_point: Point,
            end_point: Point,
            max_stops,
            min_stops,
            customer_categories: list[str] = None,
            last_visit_threshold_days: Optional[int] = None,

            ) -> Tuple[List[Customer], List[Tuple[float, float]], List[Tuple[float, float]]]:
        # latency for each method

        start_customer_fetch = time.time()
        customers: List[Customer] = (self.
        uow.
        customer_repository.
        fetch_distribution_customers_for_polygon(
            polygon=polygons,
            customer_categories=customer_categories,
            last_visit_threshold_days=last_visit_threshold_days
        )
        )

        if not customers:
            raise BadRequestError("No customers found in the specified polygon with the given filters.")

        end_customer_fetch = time.time()

        start_clustering = time.time()

        print("NUMBER OF CUSTOMERS FETCHED: ", len(customers))
        print("MAX STOPS: ", max_stops)
        clustered_customer, score = self.best_kmeans_cluster(customers=customers,
                                                             cluster_size=max_stops,
                                                             )
        print(f"Clustering score: {score:.2f}")
        print("NUMBER OF CUSTOMERS AFTER CLUSTERING: ", len(clustered_customer))

        if len(clustered_customer) < min_stops:
            raise BadRequestError(
                f"Not enough customers found after clustering: {len(clustered_customer)} < {min_stops}"
            )
        end_clustering = time.time()

        start_ordering = time.time()
        ordered_customers, waypoints, route_coords = SalesmanRouterMixin().run(
            customers=clustered_customer,
            start_pt=start_point,
            end_pt=end_point,
        )
        end_ordering = time.time()

        print(f"timespan customer fetch {end_customer_fetch - start_customer_fetch:.2f} s")
        print(f"timespan clustering {end_clustering - start_clustering:.2f} s")
        print(f"timespan ordering {end_ordering - start_ordering:.2f} s")



        return ordered_customers, waypoints, route_coords

    def best_kmeans_cluster(
            self,
            customers: List[Customer],
            cluster_size: int
    ) -> Tuple[List[Customer], float]:
        """
        Use KMeans to find K ≈ N/cluster_size clusters, then pick the densest
        cluster_size points across them all.

        Returns:
          - best_cluster: List[Customer] of length exactly cluster_size
          - best_score:   sum of pairwise distances (in meters) within that group
        """
        N = len(customers)
        if N < cluster_size:
            return customers, 0.0

        print("CLUSTER SIZE " , cluster_size)
        print("N SIZE " , N)
        if not (1 <= cluster_size <= N):
            raise BadRequestError(f"cluster_size must be between 1 and N. cluster_size={cluster_size}, N={N}")

        # 1) Extract lat/lon and project to Web Mercator (meters)
        transformer = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
        pts = []
        for cust in customers:
            pt = to_shape(cust.coordinates)  # Shapely Point with (lon,lat)
            x, y = transformer.transform(pt.x, pt.y)
            pts.append((x, y))
        XY = np.array(pts)  # shape (N,2)

        # 2) Decide K = floor(N/cluster_size)
        K = max(1, N // cluster_size)
        km = KMeans(n_clusters=K, random_state=0).fit(XY)
        labels = km.labels_
        centers = km.cluster_centers_

        best_score = float("inf")
        best_idxs: List[int] = []

        # 3) For each cluster from 0..K-1
        for label in range(K):
            idxs = np.where(labels == label)[0]
            if len(idxs) == 0:
                continue

            # 4) If cluster is bigger than cluster_size, pick the cluster_size points
            #    closest to the centroid
            if len(idxs) > cluster_size:
                dists = np.linalg.norm(XY[idxs] - centers[label], axis=1)
                nearest = np.argsort(dists)[:cluster_size]
                idxs = idxs[nearest]

            # 5) Compute sum of pairwise Euclidean distances
            pts_sel = XY[idxs]
            score = 0.0
            for i, j in combinations(range(len(idxs)), 2):
                score += np.linalg.norm(pts_sel[i] - pts_sel[j])

            if score < best_score:
                best_score = score
                best_idxs = idxs.tolist()

        best_cluster = [customers[i] for i in best_idxs]
        return best_cluster, best_score

    def sort_customers_by_route_wgs84(
            self,
            customers: List[Customer],
            start_pt: Point,  # lon/lat WGS84
            end_pt: Point,    # lon/lat WGS84
            buffer_deg: float = 0.05
    ) -> tuple[list[Customer], list[tuple[float, float]], list[tuple[float, float]]]:
        """
        Memory-safe version:
        - Builds/keeps the graph in WGS84 (no projection to 3857).
        - Uses OSMnx's 'length' (meters) for path weights.
        - Returns: (ordered_customers, waypoints (lat, lon), route_coords_ll (lat, lon))
        """
        import networkx as nx
        import osmnx as ox
        from shapely.geometry import MultiPoint
        from shapely.ops import unary_union

        # 1) Build a small WGS84 graph (avoid 'drive_service' to shrink size)
        visit_pts = [to_shape(c.coordinates) for c in customers]
        hull = MultiPoint([start_pt, end_pt, *visit_pts]).convex_hull
        area_ll = hull.buffer(buffer_deg)

        # Defensive: if buffer creates multiparts, dissolve to one polygon
        if area_ll.geom_type == "MultiPolygon":
            area_ll = unary_union([p for p in area_ll.geoms])

        # Smaller graph -> much lower memory
        G_ll = ox.graph_from_polygon(area_ll, network_type="drive", simplify=True, retain_all=False)

        # Keep only largest weakly connected component
        G_ll = truncate.largest_component(G_ll, strongly=False)

        # 2) Nearest nodes in WGS84 (pass lon, lat directly)
        sx, sy = start_pt.x, start_pt.y
        ex, ey = end_pt.x, end_pt.y
        start_node = ox.distance.nearest_nodes(G_ll, sx, sy)
        end_node = ox.distance.nearest_nodes(G_ll, ex, ey)

        visit_nodes = []
        for c in customers:
            pt = to_shape(c.coordinates)
            visit_nodes.append(ox.distance.nearest_nodes(G_ll, pt.x, pt.y))

        # 3) Greedy nearest-neighbor tour on the *unprojected* graph
        #    Use edge weight 'length' (meters) which OSMnx has already computed.
        route = [start_node]
        remaining = set(visit_nodes)
        while remaining:
            last = route[-1]
            lengths = nx.single_source_dijkstra_path_length(G_ll, last, weight="length")
            nxt = min(remaining, key=lambda n: lengths.get(n, float("inf")))
            route.append(nxt)
            remaining.remove(nxt)
        route.append(end_node)

        # 4) Map route nodes → Customers
        node_to_cust = {n: c for n, c in zip(visit_nodes, customers)}
        ordered_customers = [node_to_cust[n] for n in route if n in node_to_cust]

        # 5) Simple waypoints (lat, lon) for each customer in visiting order
        waypoints = [(start_pt.y, start_pt.x)]
        for cust in ordered_customers:
            pt = to_shape(cust.coordinates)
            waypoints.append((pt.y, pt.x))
        waypoints.append((end_pt.y, end_pt.x))

        # 6) Build full route polyline in WGS84 (lat, lon)
        path_nodes = []
        for u, v in zip(route[:-1], route[1:]):
            sp = nx.shortest_path(G_ll, u, v, weight="length")
            if path_nodes and sp[0] == path_nodes[-1]:
                sp = sp[1:]
            path_nodes.extend(sp)

        # Nodes store lon/lat as x/y; output (lat, lon) tuples
        route_coords_ll = [(G_ll.nodes[n]["y"], G_ll.nodes[n]["x"]) for n in path_nodes]

        return ordered_customers, waypoints, route_coords_ll


    def sort_customers_by_route_3857(
            self,
            customers: List[Customer],
            start_pt: Point,  # in lon/lat WGS84
            end_pt: Point,  # in lon/lat WGS84
            buffer_deg: float = 0.05
    ) -> tuple[list[Customer], list[tuple[float, float]], list[tuple[float,float]]]:
        # 1) Build WGS84 graph
        visit_pts = [to_shape(c.coordinates) for c in customers]
        area_ll = MultiPoint([start_pt, end_pt, *visit_pts]).convex_hull.buffer(buffer_deg)
        G_ll = ox.graph_from_polygon(area_ll, network_type="drive_service",simplify=True)  # lat/lon graph
        G_ll = truncate.largest_component(G_ll, strongly=False)


        # 2) Project graph to EPSG:3857
        G = ox.project_graph(G_ll, to_crs="EPSG:3857")

        # 3) Project points to 3857
        tf = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
        sx, sy = tf.transform(start_pt.x, start_pt.y)
        ex, ey = tf.transform(end_pt.x, end_pt.y)
        start_node = ox.distance.nearest_nodes(G, sx, sy)
        end_node = ox.distance.nearest_nodes(G, ex, ey)

        visit_nodes = []
        for c in customers:
            px, py = to_shape(c.coordinates).x, to_shape(c.coordinates).y
            vx, vy = tf.transform(px, py)
            visit_nodes.append(ox.distance.nearest_nodes(G, vx, vy))

        # 4) Nearest‐neighbor tour on the projected graph
        route = [start_node]
        remaining = set(visit_nodes)
        while remaining:
            last = route[-1]
            lengths = nx.single_source_dijkstra_path_length(G, last, weight="length")
            nxt = min(remaining, key=lambda n: lengths.get(n, float("inf")))
            route.append(nxt)
            remaining.remove(nxt)
        route.append(end_node)

        # 5) Map back route-nodes → Customers
        node_to_cust = {n: c for n, c in zip(visit_nodes, customers)}
        ordered_customers = [node_to_cust[n] for n in route if n in node_to_cust]

        # 6) Build simple waypoints (lat/lon)
        waypoints = [(start_pt.y, start_pt.x)]
        for cust in ordered_customers:
            pt = to_shape(cust.coordinates)
            waypoints.append((pt.y, pt.x))
        waypoints.append((end_pt.y, end_pt.x))

        # 7) Build full route polyline in 3857
        path_nodes = []
        for u, v in zip(route[:-1], route[1:]):
            sp = nx.shortest_path(G, u, v, weight="length")
            if path_nodes and sp[0] == path_nodes[-1]:
                sp = sp[1:]
            path_nodes.extend(sp)
        route_coords_3857 = [(G.nodes[n]["y"], G.nodes[n]["x"]) for n in path_nodes]

        # 8) (Optional) If you need lat/lon polyline, reproject back
        inv_tf = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
        route_coords_ll = [
            inv_tf.transform(x, y)[::-1]  # (lat, lon)
            for x, y in route_coords_3857
        ]

        return ordered_customers, waypoints, route_coords_ll
